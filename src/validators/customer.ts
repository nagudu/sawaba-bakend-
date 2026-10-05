import { z } from 'zod'

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export const updateCustomerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150).optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Provide a valid email address.')
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
    reminderOptIn: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' })