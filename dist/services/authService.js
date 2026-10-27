"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeAdmin = serializeAdmin;
exports.loginAdmin = loginAdmin;
exports.getMe = getMe;
exports.updateAdminProfile = updateAdminProfile;
exports.changeAdminPassword = changeAdminPassword;
exports.requestPasswordReset = requestPasswordReset;
exports.verifyPasswordResetOtp = verifyPasswordResetOtp;
exports.resetPasswordWithOtp = resetPasswordWithOtp;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const mailer_1 = require("./mailer");
const smsService_1 = require("./smsService");
const phone_1 = require("../utils/phone");
const otpService_1 = require("./otpService");
function serializeAdmin(admin) {
    const { id, name, email, role, avatarUrl, isActive, createdAt, updatedAt } = admin;
    return { id, name, email, role, avatarUrl: avatarUrl ?? null, isActive, createdAt, updatedAt };
}
async function loginAdmin(input) {
    const admin = await database_1.prisma.admin.findUnique({ where: { email: input.email } });
    if (!admin) {
        throw new errors_1.UnauthorizedError('Invalid email or password.');
    }
    if (!admin.isActive) {
        throw new errors_1.UnauthorizedError('This account has been deactivated. Contact support.');
    }
    const match = await bcryptjs_1.default.compare(input.password, admin.password);
    if (!match) {
        throw new errors_1.UnauthorizedError('Invalid email or password.');
    }
    const token = jsonwebtoken_1.default.sign({ sub: admin.id, email: admin.email, name: admin.name, role: admin.role }, env_1.env.jwtSecret, { expiresIn: env_1.env.jwtExpiresIn });
    return { token, admin: serializeAdmin(admin) };
}
async function getMe(adminId) {
    const admin = await database_1.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
        throw new errors_1.UnauthorizedError('Account no longer exists.');
    }
    return serializeAdmin(admin);
}
async function updateAdminProfile(adminId, input) {
    const admin = await database_1.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
        throw new errors_1.UnauthorizedError('Account no longer exists.');
    }
    if (input.email && input.email !== admin.email) {
        const existing = await database_1.prisma.admin.findUnique({ where: { email: input.email } });
        if (existing && existing.id !== adminId) {
            throw new errors_1.ConflictError('Another administrator is already using this email address.');
        }
    }
    const updated = await database_1.prisma.admin.update({
        where: { id: adminId },
        data: {
            ...(input.name ? { name: input.name } : {}),
            ...(input.email ? { email: input.email } : {}),
            ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        },
    });
    return serializeAdmin(updated);
}
async function changeAdminPassword(adminId, currentPassword, newPassword) {
    const admin = await database_1.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
        throw new errors_1.UnauthorizedError('Account no longer exists.');
    }
    const match = await bcryptjs_1.default.compare(currentPassword, admin.password);
    if (!match) {
        throw new errors_1.AppError('Current password is incorrect.', 400);
    }
    const hashedPassword = await bcryptjs_1.default.hash(newPassword, 12);
    await database_1.prisma.admin.update({
        where: { id: adminId },
        data: { password: hashedPassword },
    });
}
/**
 * Forgot Password — password_reset_otps backs ADMIN, BARBER and CUSTOMER.
 *
 * request  → the code is ONLY ever delivered (email or SMS); never returned.
 * verify   → checks the code, CONSUMES it (single use) and returns a short-lived
 *            reset token that authorises the reset step.
 * reset    → trusts the reset token, writes the new bcrypt hash, then expires
 *            every outstanding code for that account.
 *
 * The messages returned by `request` are intentionally generic: they never
 * confirm that an account exists, so the endpoint can't be used to harvest
 * registered email addresses.
 */
const RESET_GENERIC_MESSAGE = 'If an account exists for this email, a 6-digit reset code has been sent to it. It expires in ' +
    `${otpService_1.OTP_TTL_MINUTES} minutes and is for one-time use.`;
async function findForPasswordReset(email, target) {
    if (target === 'ADMIN') {
        const admin = await database_1.prisma.admin.findUnique({ where: { email } });
        if (!admin || !admin.isActive)
            return null;
        return { id: admin.id, name: admin.name, email: admin.email, phone: null };
    }
    if (target === 'BARBER') {
        const barber = await database_1.prisma.barber.findFirst({ where: { email } });
        if (!barber || !barber.isActive)
            return null;
        return { id: barber.id, name: barber.name, email: barber.email, phone: barber.phone };
    }
    const customer = await database_1.prisma.customer.findFirst({ where: { email } });
    if (!customer || !customer.isActive)
        return null;
    return { id: customer.id, name: customer.fullName, email: customer.email, phone: customer.phone };
}
/** Sends an OTP to the account via email, falling back to SMS when email is absent. */
async function deliverResetOtp(account, code) {
    let delivered = false;
    if (account.email && (0, mailer_1.isValidRecipient)(account.email)) {
        try {
            await (0, mailer_1.sendEmail)({
                to: account.email,
                subject: 'SAWABA — Password Reset Verification Code',
                text: `Hello ${account.name},\n\nYour 6-digit password reset verification code is: ${code}\n\nThis code will expire in ${otpService_1.OTP_TTL_MINUTES} minutes and can only be used once. If you did not request a password reset, please ignore this email or contact support.\n\n— SAWABA Grooming Studio`,
                html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;border:1px solid #2a2a32;border-radius:12px;background:#0d0d12;color:#f3f4f6;">
            <h2 style="color:#c9a24b;margin-top:0;">Password Reset Code</h2>
            <p style="color:#9ca3af;font-size:14px;">Use the verification code below to reset your password. It will expire in ${otpService_1.OTP_TTL_MINUTES} minutes and can only be used once.</p>
            <div style="margin:24px 0;text-align:center;">
              <span style="display:inline-block;padding:12px 24px;background:#181820;border:1px solid #c9a24b;border-radius:8px;font-size:28px;font-family:monospace;letter-spacing:6px;font-weight:bold;color:#facc15;">
                ${code}
              </span>
            </div>
            <p style="color:#6b7280;font-size:12px;">If you did not request this, you can safely ignore this message.</p>
          </div>
        `,
            });
            delivered = true;
        }
        catch (mailErr) {
            console.warn('[authService] reset code email failed:', mailErr.message);
        }
    }
    if (!delivered && (0, smsService_1.isSmsConfigured)() && account.phone) {
        const e164 = (0, phone_1.toE164)((0, phone_1.normalizeNigerianPhone)(account.phone));
        if (e164) {
            try {
                await (0, smsService_1.sendSms)(e164, `Your SAWABA password reset code is ${code}. It expires in ${otpService_1.OTP_TTL_MINUTES} minutes and is for one-time use.`);
                delivered = true;
            }
            catch (smsErr) {
                console.warn('[authService] reset code SMS failed:', smsErr.message);
            }
        }
    }
    return delivered;
}
/**
 * Step 1 — request a reset code. Always returns HTTP 200 with a generic
 * message; never reveals whether the account exists and never returns the code.
 */
async function requestPasswordReset(email, target = 'ADMIN') {
    const account = await findForPasswordReset(email, target);
    if (!account) {
        return { message: RESET_GENERIC_MESSAGE };
    }
    // Resend cooldown: refuse a new code while an unexpired one was just issued.
    const live = await database_1.prisma.passwordResetOtp.findFirst({
        where: { email, target, consumedAt: null, expiresAt: { gt: new Date() } },
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
    const scope = `${target.toLowerCase()}:${email}`;
    const codeHash = (0, otpService_1.hashOtp)(code, scope);
    // Invalidating older active codes keeps exactly one usable code per account.
    await database_1.prisma.passwordResetOtp.updateMany({
        where: { email, target, consumedAt: null },
        data: { consumedAt: new Date() },
    });
    await database_1.prisma.passwordResetOtp.create({
        data: {
            email,
            target,
            codeHash,
            expiresAt: new Date(Date.now() + otpService_1.OTP_TTL_MINUTES * 60 * 1000),
        },
    });
    const delivered = await deliverResetOtp(account, code);
    if (!delivered) {
        // Nothing was actually sent — discard the code so no zombie row lingers.
        await database_1.prisma.passwordResetOtp.updateMany({
            where: { email, target, consumedAt: null },
            data: { consumedAt: new Date() },
        });
        return { message: RESET_GENERIC_MESSAGE };
    }
    return {
        message: `A 6-digit reset code has been sent to ${account.email ? `your email (${account.email})` : 'your phone'}. It expires in ${otpService_1.OTP_TTL_MINUTES} minutes.`,
    };
}
/**
 * Step 2 — verify the code. On success the code is consumed (single use) and
 * a short-lived reset token is returned in exchange. The code never comes back.
 */
async function verifyPasswordResetOtp(email, code, target = 'ADMIN') {
    const otp = await database_1.prisma.passwordResetOtp.findFirst({
        where: {
            email,
            target,
            consumedAt: null,
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
    });
    if (!otp) {
        throw new errors_1.UnprocessableError('This code is invalid or has expired. Please request a new code.');
    }
    if (otp.attempts >= otpService_1.MAX_OTP_ATTEMPTS) {
        await database_1.prisma.passwordResetOtp.update({
            where: { id: otp.id },
            data: { consumedAt: new Date() },
        });
        throw new errors_1.UnprocessableError('Too many incorrect attempts with this code. Please request a new code.');
    }
    const scope = `${target.toLowerCase()}:${email}`;
    if ((0, otpService_1.hashOtp)(code.trim(), scope) !== otp.codeHash) {
        await database_1.prisma.passwordResetOtp.update({
            where: { id: otp.id },
            data: { attempts: { increment: 1 } },
        });
        throw new errors_1.UnprocessableError('Incorrect verification code. Please try again.');
    }
    // Single use: consume the code the moment it is correctly verified.
    const consumed = await database_1.prisma.passwordResetOtp.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
    });
    const account = await findForPasswordReset(email, target);
    if (!account) {
        throw new errors_1.UnprocessableError('This account is no longer available. Please contact support.');
    }
    const payload = {
        sub: account.id,
        email,
        target,
        otpId: consumed.id,
        purpose: 'password_reset',
    };
    return { resetToken: (0, otpService_1.signResetToken)(payload), expiresInSeconds: otpService_1.RESET_TOKEN_TTL_SECONDS };
}
/**
 * Step 3 — reset the password. Authorised by the reset token (never the code),
 * writes a fresh bcrypt hash and invalidates every outstanding code for the
 * account so a stolen code can't be used after the reset.
 */
async function resetPasswordWithOtp(email, resetToken, newPassword, target = 'ADMIN') {
    const payload = (0, otpService_1.verifyResetToken)(resetToken);
    if (payload.purpose !== 'password_reset' || payload.email !== email || payload.target !== target) {
        throw new errors_1.UnprocessableError('This reset session is invalid for this account.');
    }
    const account = await findForPasswordReset(email, target);
    if (!account) {
        throw new errors_1.NotFoundError('This account no longer exists. Please contact support.');
    }
    const hashedPassword = await bcryptjs_1.default.hash(newPassword, 12);
    if (target === 'ADMIN') {
        await database_1.prisma.admin.update({ where: { id: account.id }, data: { password: hashedPassword } });
    }
    else if (target === 'BARBER') {
        await database_1.prisma.barber.update({ where: { id: account.id }, data: { passwordHash: hashedPassword } });
    }
    else {
        await database_1.prisma.customer.update({ where: { id: account.id }, data: { passwordHash: hashedPassword } });
    }
    // Every other outstanding code dies with the reset.
    await database_1.prisma.passwordResetOtp.updateMany({
        where: { email, target, consumedAt: null },
        data: { consumedAt: new Date() },
    });
}
//# sourceMappingURL=authService.js.map