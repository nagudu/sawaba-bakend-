"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listGalleryQuerySchema = exports.updateGallerySchema = exports.createGallerySchema = exports.GALLERY_CATEGORIES = void 0;
const zod_1 = require("zod");
exports.GALLERY_CATEGORIES = [
    'HAIRCUT',
    'FADE',
    'BEARD',
    'STYLING',
    'KIDS',
    'SALON',
];
exports.createGallerySchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(2, 'Title must be at least 2 characters.').max(200),
    category: zod_1.z.enum(exports.GALLERY_CATEGORIES).default('HAIRCUT'),
    barberId: zod_1.z.coerce.number().int().positive().optional().nullable(),
    image: zod_1.z.string().trim().url('Image must be a valid URL.').max(500).optional().nullable(),
});
exports.updateGallerySchema = exports.createGallerySchema.partial();
exports.listGalleryQuerySchema = zod_1.z.object({
    category: zod_1.z.enum(exports.GALLERY_CATEGORIES).optional(),
    barberId: zod_1.z.coerce.number().int().positive().optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
//# sourceMappingURL=gallery.js.map