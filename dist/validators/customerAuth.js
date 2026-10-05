"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerGoogleAuthSchema = exports.customerCancelSchema = exports.customerPasswordChangeSchema = exports.customerProfileUpdateSchema = exports.customerLoginPasswordSchema = exports.customerRegisterSchema = exports.customerOtpVerifySchema = exports.customerOtpRequestSchema = void 0;
const zod_1 = require("zod");
const phone = zod_1.z
    .string({ required_error: 'Phone number is required.' })
    .trim()
    .min(10, 'Provide a valid phone number.')
    .max(20, 'Provide a valid phone number.');
exports.customerOtpRequestSchema = zod_1.z.object({ phone });
exports.customerOtpVerifySchema = zod_1.z.object({
    phone,
    code: zod_1.z
        .string({ required_error: 'Enter the 6-digit code.' })
        .trim()
        .regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
});
exports.customerRegisterSchema = zod_1.z.object({
    fullName: zod_1.z
        .string({ required_error: 'Full name is required.' })
        .trim()
        .min(2, 'Full name must be at least 2 characters.')
        .max(150),
    phone,
    email: zod_1.z
        .string()
        .trim()
        .toLowerCase()
        .email('Provide a valid email address.')
        .optional()
        .or(zod_1.z.literal('').transform(() => undefined)),
    password: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters.')
        .regex(/[A-Za-z]/, 'Password must contain a letter.')
        .regex(/\d/, 'Password must contain a number.')
        .optional()
        .or(zod_1.z.literal('').transform(() => undefined)),
});
exports.customerLoginPasswordSchema = zod_1.z.object({
    phone,
    password: zod_1.z.string({ required_error: 'Password is required.' }).min(1, 'Password is required.'),
});
exports.customerProfileUpdateSchema = zod_1.z
    .object({
    fullName: zod_1.z.string().trim().min(2).max(150).optional(),
    phone: phone.optional(),
    email: zod_1.z
        .string()
        .trim()
        .toLowerCase()
        .email('Provide a valid email address.')
        .nullable()
        .optional(),
    avatarUrl: zod_1.z.string().trim().url('Provide a valid image URL.').nullable().optional(),
    preferredBarberId: zod_1.z.number().int().positive().nullable().optional(),
    favoriteServiceId: zod_1.z.number().int().positive().nullable().optional(),
    reminderOptIn: zod_1.z.boolean().optional(),
})
    .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });
exports.customerPasswordChangeSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1).optional().or(zod_1.z.literal('').transform(() => undefined)),
    newPassword: zod_1.z
        .string({ required_error: 'New password is required.' })
        .min(8, 'New password must be at least 8 characters.')
        .regex(/[A-Za-z]/, 'New password must contain a letter.')
        .regex(/\d/, 'New password must contain a number.'),
});
exports.customerCancelSchema = zod_1.z.object({
    reason: zod_1.z.string().trim().max(500).optional().nullable(),
});
/**
 * Google Identity Services hands the browser a JWT ("credential"). The body is
 * only the transport — the token is verified server-side against Google's
 * certificates before any customer is created or signed in.
 */
exports.customerGoogleAuthSchema = zod_1.z.object({
    credential: zod_1.z
        .string({ required_error: 'Google sign-in was not completed. Please try again.' })
        .trim()
        .min(20, 'Google sign-in was not completed. Please try again.')
        .max(4096, 'Invalid Google credential.'),
});
//# sourceMappingURL=customerAuth.js.map