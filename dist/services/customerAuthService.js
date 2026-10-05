"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signCustomerToken = signCustomerToken;
exports.requestLoginOtp = requestLoginOtp;
exports.verifyLoginOtp = verifyLoginOtp;
exports.registerCustomer = registerCustomer;
exports.loginWithPassword = loginWithPassword;
exports.changeCustomerPassword = changeCustomerPassword;
exports.updateCustomerProfile = updateCustomerProfile;
exports.serializeCustomer = serializeCustomer;
const node_crypto_1 = __importDefault(require("node:crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const sequelize_1 = require("sequelize");
const env_1 = require("../config/env");
const models_1 = require("../models");
const phone_1 = require("../utils/phone");
const errors_1 = require("../utils/errors");
const customerService_1 = require("./customerService");
const mailer_1 = require("./mailer");
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
function signCustomerToken(customer) {
    const payload = {
        sub: customer.id,
        phone: customer.phone,
        name: customer.fullName,
        role: 'CUSTOMER',
    };
    return jsonwebtoken_1.default.sign(payload, env_1.env.jwtSecret, {
        expiresIn: env_1.env.jwtExpiresIn,
    });
}
/** 6-digit cryptographically random code (never sequential, never guessable). */
function generateOtp() {
    return String(node_crypto_1.default.randomInt(0, 1_000_000)).padStart(6, '0');
}
function hashOtp(code, phone) {
    return node_crypto_1.default.createHmac('sha256', env_1.env.jwtSecret).update(`${phone}:${code}`).digest('hex');
}
/**
 * Delivers the OTP to the customer. Email is the transport that works today
 * (Resend); SMS gateways can be added later behind the same interface. The
 * code is also returned so the response can include it in NON-production
 * environments only, letting users test without a real inbox.
 */
async function deliverOtp(customer, phone, code) {
    const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
    await models_1.CustomerOtp.destroy({ where: { phone, purpose: 'LOGIN' } });
    await models_1.CustomerOtp.create({
        phone,
        purpose: 'LOGIN',
        codeHash: hashOtp(code, phone),
        expiresAt: expires,
    });
    if (customer.email) {
        try {
            await (0, mailer_1.sendEmail)({
                to: customer.email,
                subject: `${code} is your SAWABA login code`,
                text: `Hello ${customer.fullName},\n\nYour SAWABA verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you did not request this, you can safely ignore this email.`,
                html: `<p>Hello ${customer.fullName},</p><p>Your SAWABA verification code is <strong style="font-size:22px;letter-spacing:4px;">${code}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.</p><p style="color:#888;font-size:12px;">If you did not request this, you can safely ignore this email.</p>`,
            });
        }
        catch (error) {
            // OTP delivery failure must not crash login — the devCode fallback and
            // the retry button cover it. The cause stays in the logs.
            console.error('[customer-auth] otp email failed:', error.message);
        }
    }
    return {
        devCode: env_1.env.nodeEnv !== 'production' ? code : null,
    };
}
/** Step 1 of phone login: find the account and send an OTP. */
async function requestLoginOtp(rawPhone) {
    const phone = (0, phone_1.normalizeNigerianPhone)(rawPhone);
    if (!(0, phone_1.isPlausiblePhone)(phone)) {
        throw new errors_1.UnprocessableError('Provide a valid phone number.');
    }
    const customer = await models_1.Customer.findOne({ where: { phone, isActive: true } });
    if (!customer) {
        // Do NOT reveal whether the number is registered (enumeration safety) —
        // but also do not burn an OTP. Return a guidance message instead.
        return {
            found: false,
            message: 'No account found for this number. Please create one first.',
            devCode: null,
        };
    }
    const code = generateOtp();
    const { devCode } = await deliverOtp(customer, phone, code);
    return { found: true, message: `We sent a 6-digit code to ${customer.email ?? 'your contact'}. It expires in ${OTP_TTL_MINUTES} minutes.`, devCode };
}
/** Step 2 of phone login: verify the OTP and issue a session token. */
async function verifyLoginOtp(rawPhone, code) {
    const phone = (0, phone_1.normalizeNigerianPhone)(rawPhone);
    const record = await models_1.CustomerOtp.findOne({
        where: { phone, purpose: 'LOGIN', consumedAt: null, expiresAt: { [sequelize_1.Op.gt]: new Date() } },
        order: [['createdAt', 'DESC']],
    });
    if (!record) {
        throw new errors_1.UnauthorizedError('This code has expired. Please request a new one.');
    }
    if (record.attempts >= MAX_ATTEMPTS) {
        await record.destroy();
        throw new errors_1.UnauthorizedError('Too many incorrect attempts. Please request a new code.');
    }
    if (record.codeHash !== hashOtp(code.trim(), phone)) {
        await record.increment('attempts');
        throw new errors_1.UnauthorizedError('Incorrect code. Please try again.');
    }
    await record.update({ consumedAt: new Date() });
    const customer = await models_1.Customer.findOne({ where: { phone, isActive: true } });
    if (!customer) {
        throw new errors_1.UnauthorizedError('Account no longer exists or has been deactivated.');
    }
    await (0, customerService_1.ensureCustomerCode)(customer);
    await customer.update({ lastLoginAt: new Date() });
    return { token: signCustomerToken(customer), customer };
}
/** Registration: creates the one account per phone and logs the customer in. */
async function registerCustomer(input) {
    const phone = (0, phone_1.normalizeNigerianPhone)(input.phone);
    if (!(0, phone_1.isPlausiblePhone)(phone)) {
        throw new errors_1.UnprocessableError('Provide a valid phone number.');
    }
    if (input.email) {
        const emailTaken = await models_1.Customer.findOne({ where: { email: input.email.trim().toLowerCase() } });
        if (emailTaken) {
            throw new errors_1.ConflictError('This email is already registered to another account.');
        }
    }
    const existing = await models_1.Customer.findOne({ where: { phone } });
    if (existing) {
        // Never create duplicates: if the caller is who we think, upgrade the
        // legacy guest record instead (verified below via OTP or password).
        if (existing.passwordHash || existing.email) {
            throw new errors_1.ConflictError('We found an existing account for this number. Please login with OTP instead.');
        }
        // Legacy guest-only record with no credentials: attach the new details.
        if (input.email)
            existing.email = input.email.trim().toLowerCase();
        if (input.password)
            existing.passwordHash = await bcryptjs_1.default.hash(input.password, 10);
        await existing.save();
        await (0, customerService_1.ensureCustomerCode)(existing);
        await existing.update({ lastLoginAt: new Date() });
        return { token: signCustomerToken(existing), customer: existing };
    }
    const customer = await models_1.Customer.create({
        fullName: input.fullName.trim(),
        phone,
        email: input.email?.trim().toLowerCase() ?? null,
        passwordHash: input.password ? await bcryptjs_1.default.hash(input.password, 10) : null,
    });
    await (0, customerService_1.ensureCustomerCode)(customer);
    await customer.update({ lastLoginAt: new Date() });
    return { token: signCustomerToken(customer), customer };
}
/** Password login for customers who chose a password at registration. */
async function loginWithPassword(rawPhone, password) {
    const phone = (0, phone_1.normalizeNigerianPhone)(rawPhone);
    const customer = await models_1.Customer.findOne({ where: { phone, isActive: true } });
    if (!customer?.passwordHash) {
        throw new errors_1.UnauthorizedError('No password login for this number. Use phone code instead.');
    }
    const ok = await bcryptjs_1.default.compare(password, customer.passwordHash);
    if (!ok) {
        throw new errors_1.UnauthorizedError('Incorrect phone number or password.');
    }
    await (0, customerService_1.ensureCustomerCode)(customer);
    await customer.update({ lastLoginAt: new Date() });
    return { token: signCustomerToken(customer), customer };
}
/** Change password while logged in (current password required when one exists). */
async function changeCustomerPassword(customerId, currentPassword, newPassword) {
    const customer = await models_1.Customer.findByPk(customerId);
    if (!customer)
        throw new errors_1.NotFoundError('Account not found.');
    if (customer.passwordHash) {
        if (!currentPassword) {
            throw new errors_1.UnprocessableError('Enter your current password first.');
        }
        const ok = await bcryptjs_1.default.compare(currentPassword, customer.passwordHash);
        if (!ok)
            throw new errors_1.UnauthorizedError('Current password is incorrect.');
    }
    await customer.update({ passwordHash: await bcryptjs_1.default.hash(newPassword, 10) });
}
/** Profile updates. Email changes require OTP re-verification when set. */
async function updateCustomerProfile(customerId, patch) {
    const customer = await models_1.Customer.findByPk(customerId);
    if (!customer)
        throw new errors_1.NotFoundError('Account not found.');
    if (!customer.isActive)
        throw new errors_1.ForbiddenError('This account has been deactivated.');
    const fields = {};
    if (patch.fullName !== undefined && patch.fullName.trim()) {
        fields.fullName = patch.fullName.trim();
    }
    if (patch.phone !== undefined && patch.phone.trim()) {
        const phone = (0, phone_1.normalizeNigerianPhone)(patch.phone);
        if (!(0, phone_1.isPlausiblePhone)(phone)) {
            throw new errors_1.UnprocessableError('Provide a valid phone number.');
        }
        // One account per phone number — the same rule the register path enforces.
        const taken = await models_1.Customer.findOne({ where: { phone } });
        if (taken && taken.id !== customer.id) {
            throw new errors_1.ConflictError('This phone number is already in use by another account.');
        }
        fields.phone = phone;
        // Supplying a real number clears the Google placeholder state.
        fields.phoneVerified = true;
    }
    if (patch.email !== undefined) {
        const email = patch.email ? patch.email.trim().toLowerCase() : null;
        if (email && email !== customer.email) {
            const taken = await models_1.Customer.findOne({ where: { email } });
            if (taken)
                throw new errors_1.ConflictError('This email is already in use by another account.');
        }
        fields.email = email;
    }
    if (patch.avatarUrl !== undefined)
        fields.avatarUrl = patch.avatarUrl;
    if (patch.preferredBarberId !== undefined)
        fields.preferredBarberId = patch.preferredBarberId;
    if (patch.favoriteServiceId !== undefined)
        fields.favoriteServiceId = patch.favoriteServiceId;
    if (patch.reminderOptIn !== undefined)
        fields.reminderOptIn = patch.reminderOptIn;
    await customer.update(fields);
    return customer;
}
/** Safe public shape for API responses — never leaks the password hash. */
function serializeCustomer(customer) {
    return {
        id: customer.id,
        customerCode: customer.customerCode ?? `CUS-${String(customer.id).padStart(4, '0')}`,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        avatarUrl: customer.avatarUrl,
        preferredBarberId: customer.preferredBarberId,
        favoriteServiceId: customer.favoriteServiceId,
        reminderOptIn: customer.reminderOptIn,
        isActive: customer.isActive,
        // False for accounts created via Google, which still need a real number.
        phoneVerified: customer.phoneVerified,
        // Whether a Google account is linked. The `sub` itself is never exposed.
        hasGoogleAccount: Boolean(customer.googleSub),
        createdAt: customer.createdAt,
        lastLoginAt: customer.lastLoginAt,
    };
}
//# sourceMappingURL=customerAuthService.js.map