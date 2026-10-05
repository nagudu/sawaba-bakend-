"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminSchema = exports.changePasswordSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
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
//# sourceMappingURL=auth.js.map