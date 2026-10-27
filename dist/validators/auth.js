"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAdminProfileSchema = exports.forgotPasswordResetSchema = exports.forgotPasswordVerifySchema = exports.forgotPasswordRequestSchema = exports.createAdminSchema = exports.changePasswordSchema = exports.loginSchema = exports.passwordResetTargets = void 0;
const zod_1 = require("zod");
/** Account types that have a password-reset flow. */
exports.passwordResetTargets = ['ADMIN', 'BARBER', 'CUSTOMER'];
exports.loginSchema = zod_1.z.object({
    email: zod_1.z
        .string({ required_error: 'Email is required.' })
        .trim()
        .toLowerCase()
        .email('Provide a valid email address.'),
    password: zod_1.z
        .string({ required_error: 'Password is required.' })
        .min(1, 'Password is required.'),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, 'Current password is required.'),
    newPassword: zod_1.z
        .string()
        .min(8, 'New password must be at least 8 characters.')
        .regex(/[A-Za-z]/, 'New password must contain a letter.')
        .regex(/\d/, 'New password must contain a number.'),
});
exports.createAdminSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
    email: zod_1.z.string().trim().toLowerCase().email('Provide a valid email address.'),
    password: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters.')
        .regex(/[A-Za-z]/, 'Password must contain a letter.')
        .regex(/\d/, 'Password must contain a number.'),
    role: zod_1.z.enum(['ADMIN']).default('ADMIN'),
});
exports.forgotPasswordRequestSchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase().email('Provide a valid email address.'),
    target: zod_1.z.enum(exports.passwordResetTargets).optional().default('ADMIN'),
});
exports.forgotPasswordVerifySchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase().email('Provide a valid email address.'),
    code: zod_1.z.string().trim().length(6, 'Verification code must be 6 digits.'),
    target: zod_1.z.enum(exports.passwordResetTargets).optional().default('ADMIN'),
});
exports.forgotPasswordResetSchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase().email('Provide a valid email address.'),
    resetToken: zod_1.z
        .string({ required_error: 'Reset token is required.' })
        .trim()
        .min(1, 'Reset token is required.'),
    newPassword: zod_1.z
        .string()
        .min(8, 'New password must be at least 8 characters.')
        .regex(/[A-Za-z]/, 'New password must contain a letter.')
        .regex(/\d/, 'New password must contain a number.'),
    target: zod_1.z.enum(exports.passwordResetTargets).optional().default('ADMIN'),
});
exports.updateAdminProfileSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(100).optional(),
    email: zod_1.z.string().trim().toLowerCase().email('Provide a valid email address.').optional(),
    avatarUrl: zod_1.z.string().trim().optional().nullable(),
});
//# sourceMappingURL=auth.js.map