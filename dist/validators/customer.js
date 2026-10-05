"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCustomerSchema = exports.listCustomersQuerySchema = void 0;
const zod_1 = require("zod");
exports.listCustomersQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(150).optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
    includeInactive: zod_1.z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => value === 'true'),
});
exports.updateCustomerSchema = zod_1.z
    .object({
    fullName: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150).optional(),
    email: zod_1.z
        .string()
        .trim()
        .toLowerCase()
        .email('Provide a valid email address.')
        .nullable()
        .optional(),
    isActive: zod_1.z.boolean().optional(),
    reminderOptIn: zod_1.z.boolean().optional(),
})
    .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });
//# sourceMappingURL=customer.js.map