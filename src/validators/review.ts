import { z } from 'zod'

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const

export const createReviewSchema = z.object({
  customerName: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
  customerPhone: z.string().trim().max(32).optional().nullable(),
  customerEmail: z
    .string()
    .trim()
    .email('Email address is not valid.')
    .max(255)
    .optional()
    .nullable(),
  customerImage: z.string().trim().url('Image must be a valid URL.').max(500).optional().nullable(),
  serviceId: z.coerce.number().int().positive().optional().nullable(),
  serviceName: z.string().trim().max(150).optional().nullable(),
  barberId: z.coerce.number().int().positive().optional().nullable(),
  rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5.').max(5),
  comment: z.string().trim().min(5, 'Comment must be at least 5 characters.').max(2000),
})

export const updateReviewSchema = z.object({
  customerName: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150).optional(),
  customerPhone: z.string().trim().max(32).optional().nullable(),
  customerEmail: z.string().trim().email('Email address is not valid.').max(255).optional().nullable(),
  serviceName: z.string().trim().max(150).optional().nullable(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().trim().min(5).max(2000).optional(),
  status: z.enum(REVIEW_STATUSES).optional(),
  isApproved: z.boolean().optional(),
})

export const listReviewsQuerySchema = z.object({
  approved: z.enum(['true', 'false', 'all']).optional().default('true'),
  status: z.enum([...REVIEW_STATUSES, 'all']).optional(),
  search: z.string().trim().max(200).optional(),
  barberId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export type CreateReviewInput = z.infer<typeof createReviewSchema>
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>