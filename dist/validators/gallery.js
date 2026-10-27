"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listGalleryQuerySchema = exports.updateGallerySchema = exports.createGallerySchema = exports.GALLERY_MEDIA_TYPES = exports.GALLERY_CATEGORIES = void 0;
const zod_1 = require("zod");
exports.GALLERY_CATEGORIES = [
    'HAIRCUT',
    'FADE',
    'BEARD',
    'STYLING',
    'KIDS',
    'SALON',
];
exports.GALLERY_MEDIA_TYPES = ['IMAGE', 'VIDEO'];
/**
 * Accepted media references — either an absolute (Cloudinary) URL or a
 * server-relative upload/seed path. The gallery stores both forms, so the
 * strict `.url()` check wrongly rejected seed/local images on edit.
 */
const mediaRef = zod_1.z
    .string()
    .trim()
    .min(1, 'Media reference is required.')
    .max(500)
    .refine((value) => /^(https?:\/\/|\/(?:uploads|api)\/|data:image\/)/.test(value), 'Media must be a valid URL or a server upload path.');
exports.createGallerySchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(2, 'Title must be at least 2 characters.').max(200),
    category: zod_1.z.enum(exports.GALLERY_CATEGORIES).default('HAIRCUT'),
    mediaType: zod_1.z.enum(exports.GALLERY_MEDIA_TYPES).optional(),
    barberId: zod_1.z.coerce.number().int().positive().optional().nullable(),
    image: mediaRef.optional().nullable(),
    video: mediaRef.optional().nullable(),
    duration: zod_1.z.coerce.number().int().nonnegative().optional().nullable(),
});
exports.updateGallerySchema = exports.createGallerySchema.partial();
exports.listGalleryQuerySchema = zod_1.z.object({
    category: zod_1.z.enum(exports.GALLERY_CATEGORIES).optional(),
    mediaType: zod_1.z.enum(exports.GALLERY_MEDIA_TYPES).optional(),
    barberId: zod_1.z.coerce.number().int().positive().optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
//# sourceMappingURL=gallery.js.map