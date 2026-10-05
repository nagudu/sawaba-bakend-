"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAvailabilityBulkSchema = exports.availabilityParamsSchema = exports.setAvailabilitySchema = exports.listBarbersQuerySchema = exports.updateBarberSchema = exports.createBarberSchema = exports.barberIdParamsSchema = void 0;
const zod_1 = require("zod");
exports.barberIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('Barber id must be a positive integer.'),
});
exports.createBarberSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
    image: zod_1.z.string().trim().url('Image must be a valid URL.').max(500).optional().nullable(),
    phone: zod_1.z.string().trim().max(32).optional().nullable(),
    email: zod_1.z.string().trim().email('Email must be a valid email address.').max(255).optional().nullable(),
    specialty: zod_1.z.string().trim().max(255).optional().nullable(),
    biography: zod_1.z.string().trim().max(5000).optional().nullable(),
    experience: zod_1.z.coerce.number().int().min(0).max(80).default(0),
    rating: zod_1.z.coerce.number().min(0).max(5).default(0),
    /** Business classification — admin-only, never shown on the public site. */
    barberType: zod_1.z.enum(['INTERNAL', 'EXTERNAL']).default('INTERNAL'),
    /** Coverage area / base location (external barbers). Admin-only. */
    location: zod_1.z.preprocess((value) => (value === '' ? undefined : value), zod_1.z.string().trim().max(150).optional().nullable()),
    /** Commission config — PERCENTAGE (0-100) or FIXED (naira). Admin-only. */
    commissionType: zod_1.z.enum(['PERCENTAGE', 'FIXED']).default('PERCENTAGE'),
    commissionValue: zod_1.z.coerce.number().min(0).max(1000000).default(0),
    isActive: zod_1.z.coerce.boolean().default(true),
    /** Barber Portal access: flipping this on (with a password) lets the barber sign in. */
    portalEnabled: zod_1.z.coerce.boolean().optional(),
    /** Admin-issued portal password. Min 8 chars; hashed server-side, never stored raw. */
    portalPassword: zod_1.z.string().min(8, 'Portal password must be at least 8 characters.').max(128).optional().nullable(),
    serviceIds: zod_1.z.preprocess((value) => (typeof value === 'string' ? value.split(',').map((id) => id.trim()).filter(Boolean) : value), zod_1.z.array(zod_1.z.coerce.number().int().positive()).max(40).optional()),
}).superRefine((data, ctx) => {
    if (data.commissionType === 'PERCENTAGE' && data.commissionValue > 100) {
        ctx.addIssue({
            code: 'custom',
            path: ['commissionValue'],
            message: 'Percentage commission cannot exceed 100.',
        });
    }
});
/** Same shape, all optional — built from the raw object so .partial() sees a ZodObject. */
exports.updateBarberSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150).optional(),
    image: zod_1.z.string().trim().url('Image must be a valid URL.').max(500).optional().nullable(),
    phone: zod_1.z.string().trim().max(32).optional().nullable(),
    email: zod_1.z.string().trim().email('Email must be a valid email address.').max(255).optional().nullable(),
    specialty: zod_1.z.string().trim().max(255).optional().nullable(),
    biography: zod_1.z.string().trim().max(5000).optional().nullable(),
    experience: zod_1.z.coerce.number().int().min(0).max(80).optional(),
    rating: zod_1.z.coerce.number().min(0).max(5).optional(),
    barberType: zod_1.z.enum(['INTERNAL', 'EXTERNAL']).optional(),
    location: zod_1.z.preprocess((value) => (value === '' ? undefined : value), zod_1.z.string().trim().max(150).optional().nullable()),
    commissionType: zod_1.z.enum(['PERCENTAGE', 'FIXED']).optional(),
    commissionValue: zod_1.z.coerce.number().min(0).max(1000000).optional(),
    isActive: zod_1.z.coerce.boolean().optional(),
    portalEnabled: zod_1.z.coerce.boolean().optional(),
    portalPassword: zod_1.z.string().min(8, 'Portal password must be at least 8 characters.').max(128).optional().nullable(),
    serviceIds: zod_1.z.preprocess((value) => (typeof value === 'string' ? value.split(',').map((id) => id.trim()).filter(Boolean) : value), zod_1.z.array(zod_1.z.coerce.number().int().positive()).max(40).optional()),
}).superRefine((data, ctx) => {
    if (data.commissionType === 'PERCENTAGE' && data.commissionValue !== undefined && data.commissionValue > 100) {
        ctx.addIssue({
            code: 'custom',
            path: ['commissionValue'],
            message: 'Percentage commission cannot exceed 100.',
        });
    }
});
exports.listBarbersQuerySchema = zod_1.z.object({
    serviceId: zod_1.z.coerce.number().int().positive().optional(),
    isActive: zod_1.z.enum(['true', 'false']).optional(),
    includeInactive: zod_1.z.enum(['true', 'false']).optional(),
    search: zod_1.z.string().trim().max(150).optional(),
    /** Admin-only filters (PUBLIC list ignores/never receives them). */
    barberType: zod_1.z.enum(['INTERNAL', 'EXTERNAL']).optional(),
    location: zod_1.z.string().trim().max(150).optional(),
    availableToday: zod_1.z.enum(['true', 'false']).optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
exports.setAvailabilitySchema = zod_1.z.object({
    dayOfWeek: zod_1.z.coerce.number().int().min(0).max(6),
    startTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be in HH:mm format.'),
    endTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'endTime must be in HH:mm format.'),
    isAvailable: zod_1.z.boolean().default(true),
}).refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime.',
    path: ['endTime'],
});
exports.availabilityParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('Barber id must be a positive integer.'),
});
exports.setAvailabilityBulkSchema = zod_1.z.union([
    exports.setAvailabilitySchema,
    zod_1.z.array(exports.setAvailabilitySchema),
]);
//# sourceMappingURL=barber.js.map