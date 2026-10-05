"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replySchema = exports.contactStatusSchema = exports.markReadSchema = exports.listContactQuerySchema = exports.createContactSchema = void 0;
const zod_1 = require("zod");
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;
exports.createContactSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
    phone: zod_1.z.string().trim().regex(PHONE_PATTERN, 'Provide a valid phone number.').optional().nullable(),
    email: zod_1.z.string().trim().toLowerCase().email('Provide a valid email address.'),
    subject: zod_1.z.string().trim().max(200).optional().nullable(),
    message: zod_1.z.string().trim().min(5, 'Message must be at least 5 characters.').max(5000),
});
exports.listContactQuerySchema = zod_1.z.object({
    read: zod_1.z.enum(['true', 'false', 'all']).optional().default('all'),
    status: zod_1.z.enum(['NEW', 'READ', 'REPLIED', 'ARCHIVED', 'all']).optional().default('all'),
    search: zod_1.z.string().trim().max(200).optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
exports.markReadSchema = zod_1.z.object({
    isRead: zod_1.z.boolean(),
});
exports.contactStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['NEW', 'READ', 'REPLIED', 'ARCHIVED']),
});
exports.replySchema = zod_1.z.object({
    message: zod_1.z
        .string()
        .trim()
        .min(2, 'Reply message must be at least 2 characters.')
        .max(5000, 'Reply message must be 5000 characters or fewer.'),
});
//# sourceMappingURL=contact.js.map