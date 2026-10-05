import { z } from 'zod'

const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/

export const createContactSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
  phone: z.string().trim().regex(PHONE_PATTERN, 'Provide a valid phone number.').optional().nullable(),
  email: z.string().trim().toLowerCase().email('Provide a valid email address.'),
  subject: z.string().trim().max(200).optional().nullable(),
  message: z.string().trim().min(5, 'Message must be at least 5 characters.').max(5000),
})

export const listContactQuerySchema = z.object({
  read: z.enum(['true', 'false', 'all']).optional().default('all'),
  status: z.enum(['NEW', 'READ', 'REPLIED', 'ARCHIVED', 'all']).optional().default('all'),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export const markReadSchema = z.object({
  isRead: z.boolean(),
})

export const contactStatusSchema = z.object({
  status: z.enum(['NEW', 'READ', 'REPLIED', 'ARCHIVED']),
})

export const replySchema = z.object({
  message: z
    .string()
    .trim()
    .min(2, 'Reply message must be at least 2 characters.')
    .max(5000, 'Reply message must be 5000 characters or fewer.'),
})

export type CreateContactInput = z.infer<typeof createContactSchema>
