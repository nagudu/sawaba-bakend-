"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listServicesQuerySchema = exports.updateServiceSchema = exports.createServiceSchema = exports.serviceIdParamsSchema = exports.SERVICE_CATEGORIES = void 0;
const zod_1 = require("zod");
exports.SERVICE_CATEGORIES = [
    'HAIRCUTS',
    'BEARDS',
    'HAIR_AND_BEARD',
    'GROOMING',
    'KIDS',
    'TREATMENTS',
    'STYLING',
];
exports.serviceIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('Service id must be a positive integer.'),
});
exports.createServiceSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
    description: zod_1.z.string().trim().max(2000).optional().nullable(),
    price: zod_1.z.coerce.number().min(0, 'Price cannot be negative.'),
    duration: zod_1.z.coerce.number().int().min(5, 'Duration must be at least 5 minutes.').max(480),
    image: zod_1.z.string().trim().url('Image must be a valid URL.').max(500).optional().nullable(),
    category: zod_1.z.enum(exports.SERVICE_CATEGORIES).default('HAIRCUTS'),
    isActive: zod_1.z.coerce.boolean().default(true),
});
exports.updateServiceSchema = exports.createServiceSchema.partial();
exports.listServicesQuerySchema = zod_1.z.object({
    category: zod_1.z.enum(exports.SERVICE_CATEGORIES).optional(),
    isActive: zod_1.z.enum(['true', 'false']).optional(),
    search: zod_1.z.string().trim().max(150).optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
//# sourceMappingURL=service.js.map