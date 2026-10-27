import { z } from 'zod'

export const GALLERY_CATEGORIES = [
  'HAIRCUT',
  'FADE',
  'BEARD',
  'STYLING',
  'KIDS',
  'SALON',
] as const

export const GALLERY_MEDIA_TYPES = ['IMAGE', 'VIDEO'] as const

/**
 * Accepted media references — either an absolute (Cloudinary) URL or a
 * server-relative upload/seed path. The gallery stores both forms, so the
 * strict `.url()` check wrongly rejected seed/local images on edit.
 */
const mediaRef = z
  .string()
  .trim()
  .min(1, 'Media reference is required.')
  .max(500)
  .refine(
    (value) => /^(https?:\/\/|\/(?:uploads|api)\/|data:image\/)/.test(value),
    'Media must be a valid URL or a server upload path.',
  )

export const createGallerySchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(200),
  category: z.enum(GALLERY_CATEGORIES).default('HAIRCUT'),
  mediaType: z.enum(GALLERY_MEDIA_TYPES).optional(),
  barberId: z.coerce.number().int().positive().optional().nullable(),
  image: mediaRef.optional().nullable(),
  video: mediaRef.optional().nullable(),
  duration: z.coerce.number().int().nonnegative().optional().nullable(),
})

export const updateGallerySchema = createGallerySchema.partial()

export const listGalleryQuerySchema = z.object({
  category: z.enum(GALLERY_CATEGORIES).optional(),
  mediaType: z.enum(GALLERY_MEDIA_TYPES).optional(),
  barberId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export type CreateGalleryInput = z.infer<typeof createGallerySchema>
export type UpdateGalleryInput = z.infer<typeof updateGallerySchema>