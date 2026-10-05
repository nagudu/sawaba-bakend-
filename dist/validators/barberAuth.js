"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.barberChangePasswordSchema = exports.barberLoginSchema = void 0;
const zod_1 = require("zod");
exports.barberLoginSchema = zod_1.z.object({
    identifier: zod_1.z
        .string({ required_error: 'Email or phone number is required.' })
        .trim()
        .min(3, 'Enter at least 3 characters.')
        .max(150, 'Identifier must be 150 characters or less.'),
    password: zod_1.z.string({ required_error: 'Password is required.' }).min(6, 'Password must be at least 6 characters.'),
});
exports.barberChangePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, 'Current password is required.'),
    newPassword: zod_1.z.string().min(8, 'New password must be at least 8 characters.'),
});
//# sourceMappingURL=barberAuth.js.map