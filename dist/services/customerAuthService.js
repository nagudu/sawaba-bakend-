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
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const phone_1 = require("../utils/phone");
const errors_1 = require("../utils/errors");
const customerService_1 = require("./customerService");
const mailer_1 = require("./mailer");
const smsService_1 = require("./smsService");
const otpService_1 = require("./otpService");
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
/** Case/whitespace-insensitive person-name comparison for identity matching. */
function normalizeName(value) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
/**
 * A record is a registered account once it carries credentials or has ever
 * logged in. Pure guest records (created by bookings with a shared phone
 * number) are never accounts.
 */
function isAccountRecord(record) {
    return Boolean(record.passwordHash || record.googleSub || record.lastLoginAt);
}
/**
 * Resolves the ACCOUNT that belongs to a phone number. Guest bookings may have
 * created several customer records on the same number, so login must never
 * blindly take the first phone match — it could hand someone else's guest
 * record (or another person's bookings) to the caller. Preference order:
 * password/Google-backed account, then any record that has logged in before.
 */
async function findAccountByPhone(phone) {
    const records = await database_1.prisma.customer.findMany({ where: { phone, isActive: true } });
    return (records.find((record) => Boolean(record.passwordHash || record.googleSub)) ??
        records.find((record) => Boolean(record.lastLoginAt)) ??
        null);
}
/**
 * Stores a login OTP and delivers it via SMS when SMS is configured, otherwise
 * by email. The code is never returned to the caller; a failed delivery throws
 * an honest AppError (and the stored code is deleted) so the UI never hints a
 * code exists that the user cannot have received.
 */
async function storeAndDeliverLoginOtp(customer, phone, code) {
    const expires = new Date(Date.now() + otpService_1.OTP_TTL_MINUTES * 60_000);
    await database_1.prisma.customerOtp.deleteMany({ where: { phone, purpose: 'LOGIN' } });
    const otp = await database_1.prisma.customerOtp.create({
        data: {
            phone,
            purpose: 'LOGIN',
            codeHash: (0, otpService_1.hashOtp)(code, `login:${phone}`),
            expiresAt: expires,
        },
    });
    const e164 = (0, phone_1.toE164)(phone);
    let delivered = false;
    if ((0, smsService_1.isSmsConfigured)() && e164) {
        try {
            await (0, smsService_1.sendSms)(e164, `Your SAWABA verification code is ${code}. It expires in ${otpService_1.OTP_TTL_MINUTES} minutes. Do not share it.`);
            delivered = true;
        }
        catch (smsErr) {
            console.warn('[customer-auth] otp SMS failed:', smsErr.message);
        }
    }
    if (!delivered && customer.email && (0, mailer_1.isValidRecipient)(customer.email)) {
        try {
            await (0, mailer_1.sendEmail)({
                to: customer.email,
                subject: `${code} is your SAWABA login code`,
                text: `Hello ${customer.fullName},\n\nYour SAWABA verification code is ${code}. It expires in ${otpService_1.OTP_TTL_MINUTES} minutes.\n\nIf you did not request this, you can safely ignore this email.`,
                html: `<p>Hello ${customer.fullName},</p><p>Your SAWABA verification code is <strong style="font-size:22px;letter-spacing:4px;">${code}</strong>. It expires in ${otpService_1.OTP_TTL_MINUTES} minutes.</p><p style="color:#888;font-size:12px;">If you did not request this, you can safely ignore this email.</p>`,
            });
            delivered = true;
        }
        catch (mailErr) {
            console.warn('[customer-auth] otp email failed:', mailErr.message);
        }
    }
    if (!delivered) {
        await database_1.prisma.customerOtp.delete({ where: { id: otp.id } });
        throw new errors_1.AppError('We could not deliver your code right now. Please try again in a moment or contact support.', 502);
    }
}
async function requestLoginOtp(rawPhone) {
    const phone = (0, phone_1.normalizeNigerianPhone)(rawPhone);
    if (!(0, phone_1.isPlausiblePhone)(phone)) {
        throw new errors_1.UnprocessableError('Provide a valid phone number.');
    }
    const customer = await findAccountByPhone(phone);
    if (!customer) {
        return {
            found: false,
            message: 'No account found for this number. Please create one first.',
        };
    }
    // Resend cooldown: refuse a new code while an unexpired one was just issued.
    const live = await database_1.prisma.customerOtp.findFirst({
        where: { phone, purpose: 'LOGIN', consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
    });
    if (live) {
        const waited = (Date.now() - live.createdAt.getTime()) / 1000;
        if (waited < otpService_1.RESEND_COOLDOWN_SECONDS) {
            const wait = Math.ceil(otpService_1.RESEND_COOLDOWN_SECONDS - waited);
            throw new errors_1.AppError(`Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another code.`, 429);
        }
    }
    const code = (0, otpService_1.generateOtp)();
    await storeAndDeliverLoginOtp(customer, phone, code);
    const channel = (0, phone_1.toE164)(phone) ? 'your phone' : customer.email ?? 'your contact';
    return {
        found: true,
        message: `We sent a 6-digit code to ${channel}. It expires in ${otpService_1.OTP_TTL_MINUTES} minutes.`,
    };
}
async function verifyLoginOtp(rawPhone, code) {
    const phone = (0, phone_1.normalizeNigerianPhone)(rawPhone);
    const record = await database_1.prisma.customerOtp.findFirst({
        where: { phone, purpose: 'LOGIN', consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
    });
    if (!record) {
        throw new errors_1.UnauthorizedError('This code has expired. Please request a new one.');
    }
    if (record.attempts >= otpService_1.MAX_OTP_ATTEMPTS) {
        await database_1.prisma.customerOtp.delete({ where: { id: record.id } });
        throw new errors_1.UnauthorizedError('Too many incorrect attempts. Please request a new code.');
    }
    if (record.codeHash !== (0, otpService_1.hashOtp)(code.trim(), `login:${phone}`)) {
        await database_1.prisma.customerOtp.update({
            where: { id: record.id },
            data: { attempts: { increment: 1 } },
        });
        throw new errors_1.UnauthorizedError('Incorrect code. Please try again.');
    }
    await database_1.prisma.customerOtp.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
    });
    const customer = await findAccountByPhone(phone);
    if (!customer) {
        throw new errors_1.UnauthorizedError('Account no longer exists or has been deactivated.');
    }
    await (0, customerService_1.ensureCustomerCode)(customer);
    const updatedCustomer = await database_1.prisma.customer.update({
        where: { id: customer.id },
        data: { lastLoginAt: new Date() },
    });
    return { token: signCustomerToken(updatedCustomer), customer: updatedCustomer };
}
async function registerCustomer(input) {
    const phone = (0, phone_1.normalizeNigerianPhone)(input.phone);
    if (!(0, phone_1.isPlausiblePhone)(phone)) {
        throw new errors_1.UnprocessableError('Provide a valid phone number.');
    }
    const email = input.email?.trim().toLowerCase() ?? null;
    const wantedName = normalizeName(input.fullName);
    // The number may hold several records: guest bookings from other people who
    // share this SIM never become the registrant's account.
    const byPhone = await database_1.prisma.customer.findMany({ where: { phone } });
    const existingAccount = byPhone.find((record) => Boolean(record.passwordHash || record.googleSub));
    if (existingAccount) {
        throw new errors_1.ConflictError('We found an existing account for this number. Please login with your password or phone code instead.');
    }
    // A legacy guest record on this number is only adopted when it clearly
    // belongs to the same person (matching name) — never merely because it
    // shares the phone number.
    const adoptable = byPhone.find((record) => normalizeName(record.fullName) === wantedName) ?? null;
    if (email) {
        const emailOwner = await database_1.prisma.customer.findFirst({ where: { email } });
        // The only record allowed to keep this email is the one being adopted.
        if (emailOwner && emailOwner.id !== adoptable?.id) {
            throw new errors_1.ConflictError('This email is already registered to another account.');
        }
    }
    if (adoptable) {
        const data = {
            lastLoginAt: new Date(),
        };
        if (email)
            data.email = email;
        if (input.password)
            data.passwordHash = await bcryptjs_1.default.hash(input.password, 10);
        const updated = await database_1.prisma.customer.update({
            where: { id: adoptable.id },
            data,
        });
        await (0, customerService_1.ensureCustomerCode)(updated);
        return { token: signCustomerToken(updated), customer: updated };
    }
    const customer = await database_1.prisma.customer.create({
        data: {
            fullName: input.fullName.trim(),
            phone,
            email: input.email?.trim().toLowerCase() ?? null,
            passwordHash: input.password ? await bcryptjs_1.default.hash(input.password, 10) : null,
            lastLoginAt: new Date(),
        },
    });
    await (0, customerService_1.ensureCustomerCode)(customer);
    return { token: signCustomerToken(customer), customer };
}
async function loginWithPassword(rawIdentifier, password) {
    const identifier = rawIdentifier.trim();
    const looksLikeEmail = identifier.includes('@');
    let customer = null;
    if (looksLikeEmail) {
        const records = await database_1.prisma.customer.findMany({
            where: {
                email: identifier.toLowerCase(),
                isActive: true,
            },
        });
        // Several records can share an email only in legacy data — always prefer
        // the one that actually holds the password.
        customer = records.find((record) => Boolean(record.passwordHash)) ?? records[0] ?? null;
    }
    else {
        try {
            const phone = (0, phone_1.normalizeNigerianPhone)(identifier);
            // Multiple records may sit on this number (guest bookings from people
            // who share the SIM) — only a password-bearing account can log in.
            const records = await database_1.prisma.customer.findMany({
                where: {
                    phone,
                    isActive: true,
                },
            });
            customer = records.find((record) => Boolean(record.passwordHash)) ?? null;
        }
        catch {
            // If phone normalization fails, try direct match
            customer = await database_1.prisma.customer.findFirst({
                where: {
                    phone: identifier,
                    isActive: true,
                    passwordHash: { not: null },
                },
            });
        }
    }
    if (!customer?.passwordHash) {
        throw new errors_1.UnauthorizedError('No password login for this account. Use phone code instead.');
    }
    const ok = await bcryptjs_1.default.compare(password, customer.passwordHash);
    if (!ok) {
        throw new errors_1.UnauthorizedError('Incorrect email/phone or password.');
    }
    await (0, customerService_1.ensureCustomerCode)(customer);
    const updated = await database_1.prisma.customer.update({
        where: { id: customer.id },
        data: { lastLoginAt: new Date() },
    });
    return { token: signCustomerToken(updated), customer: updated };
}
async function changeCustomerPassword(customerId, currentPassword, newPassword) {
    const customer = await database_1.prisma.customer.findUnique({ where: { id: customerId } });
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
    const newHash = await bcryptjs_1.default.hash(newPassword, 10);
    await database_1.prisma.customer.update({
        where: { id: customerId },
        data: { passwordHash: newHash },
    });
}
async function updateCustomerProfile(customerId, patch) {
    const customer = await database_1.prisma.customer.findUnique({ where: { id: customerId } });
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
        // Guest bookings may already use this number (other people sharing the
        // SIM) — only a competing ACCOUNT blocks the change, never a guest record.
        const taken = await database_1.prisma.customer.findFirst({
            where: { phone, id: { not: customer.id } },
        });
        const competingAccount = taken && isAccountRecord(taken) ? taken : null;
        if (competingAccount) {
            throw new errors_1.ConflictError('This phone number is already in use by another account.');
        }
        fields.phone = phone;
        fields.phoneVerified = true;
    }
    if (patch.email !== undefined) {
        const email = patch.email ? patch.email.trim().toLowerCase() : null;
        if (email && email !== customer.email) {
            const taken = await database_1.prisma.customer.findFirst({ where: { email } });
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
    return database_1.prisma.customer.update({
        where: { id: customerId },
        data: fields,
    });
}
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
        phoneVerified: customer.phoneVerified,
        hasGoogleAccount: Boolean(customer.googleSub),
        createdAt: customer.createdAt,
        lastLoginAt: customer.lastLoginAt,
    };
}
//# sourceMappingURL=customerAuthService.js.map