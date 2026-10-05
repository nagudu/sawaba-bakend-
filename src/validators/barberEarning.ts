import { z } from 'zod'
import { idParamsSchema } from './appointment'

/**
 * Admin barber assignment. `barberId: null` removes the assignment (falls
 * back to the customer's booked barber). `reason` feeds the audit trail.
 */
export const assignBarberSchema = z.object({
  barberId: z.coerce.number().int().positive().nullable(),
  reason: z.string().trim().max(300).optional().nullable().or(z.literal('')),
})

export const assignBarberParamsSchema = idParamsSchema

/** Earnings list filters. */
export const earningsQuerySchema = z.object({
  barberId: z.coerce.number().int().positive().optional(),
  barberType: z.enum(['INTERNAL', 'EXTERNAL']).optional(),
  status: z.enum(['PENDING', 'EARNED', 'PAID', 'CANCELLED']).optional(),
  location: z.string().trim().max(150).optional(),
  appointmentRef: z.string().trim().max(30).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export const markPaidSchema = z.object({
  note: z.string().trim().max(300).optional().nullable().or(z.literal('')),
})

export type AssignBarberInput = z.infer<typeof assignBarberSchema>
export type EarningsQuery = z.infer<typeof earningsQuerySchema>
