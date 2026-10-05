import { z } from 'zod'

export const SERVICE_CATEGORIES = [
  'HAIRCUTS',
  'BEARDS',
  'HAIR_AND_BEARD',
  'GROOMING',
  'KIDS',
  'TREATMENTS',
  'STYLING',
] as const

export const serviceIdParamsSchema = z.object({
  id: z.coerce.number().int().positive('Service id must be a positive integer.'),
})

export const createServiceSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
  description: z.string().trim().max(2000).optional().nullable(),
  price: z.coerce.number().min(0, 'Price cannot be negative.'),
  duration: z.coerce.number().int().min(5, 'Duration must be at least 5 minutes.').max(480),
  image: z.string().trim().url('Image must be a valid URL.').max(500).optional().nullable(),
  category: z.enum(SERVICE_CATEGORIES).default('HAIRCUTS'),
  isActive: z.coerce.boolean().default(true),
})

export const updateServiceSchema = createServiceSchema.partial()

export const listServicesQuerySchema = z.object({
  category: z.enum(SERVICE_CATEGORIES).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>