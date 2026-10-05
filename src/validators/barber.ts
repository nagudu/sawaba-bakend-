import { z } from 'zod'

export const barberIdParamsSchema = z.object({
  id: z.coerce.number().int().positive('Barber id must be a positive integer.'),
})

export const createBarberSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
  image: z.string().trim().url('Image must be a valid URL.').max(500).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email('Email must be a valid email address.').max(255).optional().nullable(),
  specialty: z.string().trim().max(255).optional().nullable(),
  biography: z.string().trim().max(5000).optional().nullable(),
  experience: z.coerce.number().int().min(0).max(80).default(0),
  rating: z.coerce.number().min(0).max(5).default(0),
  /** Business classification — admin-only, never shown on the public site. */
  barberType: z.enum(['INTERNAL', 'EXTERNAL']).default('INTERNAL'),
  /** Coverage area / base location (external barbers). Admin-only. */
  location: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().trim().max(150).optional().nullable(),
  ),
  /** Commission config — PERCENTAGE (0-100) or FIXED (naira). Admin-only. */
  commissionType: z.enum(['PERCENTAGE', 'FIXED']).default('PERCENTAGE'),
  commissionValue: z.coerce.number().min(0).max(1000000).default(0),
  isActive: z.coerce.boolean().default(true),
  /** Barber Portal access: flipping this on (with a password) lets the barber sign in. */
  portalEnabled: z.coerce.boolean().optional(),
  /** Admin-issued portal password. Min 8 chars; hashed server-side, never stored raw. */
  portalPassword: z.string().min(8, 'Portal password must be at least 8 characters.').max(128).optional().nullable(),
  serviceIds: z.preprocess(
    (value) => (typeof value === 'string' ? value.split(',').map((id) => id.trim()).filter(Boolean) : value),
    z.array(z.coerce.number().int().positive()).max(40).optional(),
  ),
}).superRefine((data, ctx) => {
  if (data.commissionType === 'PERCENTAGE' && data.commissionValue > 100) {
    ctx.addIssue({
      code: 'custom',
      path: ['commissionValue'],
      message: 'Percentage commission cannot exceed 100.',
    })
  }
})

/** Same shape, all optional — built from the raw object so .partial() sees a ZodObject. */
export const updateBarberSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150).optional(),
  image: z.string().trim().url('Image must be a valid URL.').max(500).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email('Email must be a valid email address.').max(255).optional().nullable(),
  specialty: z.string().trim().max(255).optional().nullable(),
  biography: z.string().trim().max(5000).optional().nullable(),
  experience: z.coerce.number().int().min(0).max(80).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  barberType: z.enum(['INTERNAL', 'EXTERNAL']).optional(),
  location: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().trim().max(150).optional().nullable(),
  ),
  commissionType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  commissionValue: z.coerce.number().min(0).max(1000000).optional(),
  isActive: z.coerce.boolean().optional(),
  portalEnabled: z.coerce.boolean().optional(),
  portalPassword: z.string().min(8, 'Portal password must be at least 8 characters.').max(128).optional().nullable(),
  serviceIds: z.preprocess(
    (value) => (typeof value === 'string' ? value.split(',').map((id) => id.trim()).filter(Boolean) : value),
    z.array(z.coerce.number().int().positive()).max(40).optional(),
  ),
}).superRefine((data, ctx) => {
  if (data.commissionType === 'PERCENTAGE' && data.commissionValue !== undefined && data.commissionValue > 100) {
    ctx.addIssue({
      code: 'custom',
      path: ['commissionValue'],
      message: 'Percentage commission cannot exceed 100.',
    })
  }
})

export const listBarbersQuerySchema = z.object({
  serviceId: z.coerce.number().int().positive().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(150).optional(),
  /** Admin-only filters (PUBLIC list ignores/never receives them). */
  barberType: z.enum(['INTERNAL', 'EXTERNAL']).optional(),
  location: z.string().trim().max(150).optional(),
  availableToday: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export const setAvailabilitySchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be in HH:mm format.'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'endTime must be in HH:mm format.'),
  isAvailable: z.boolean().default(true),
}).refine((data) => data.endTime > data.startTime, {
  message: 'endTime must be after startTime.',
  path: ['endTime'],
})

export const availabilityParamsSchema = z.object({
  id: z.coerce.number().int().positive('Barber id must be a positive integer.'),
})

export const setAvailabilityBulkSchema = z.union([
  setAvailabilitySchema,
  z.array(setAvailabilitySchema),
])

export type CreateBarberInput = z.infer<typeof createBarberSchema>
export type UpdateBarberInput = z.infer<typeof updateBarberSchema>