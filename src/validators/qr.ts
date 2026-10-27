import { z } from 'zod'

export const qrValidateBodySchema = z
  .object({
    /** Raw QR payload (e.g. `sawaba:<token>`). */
    token: z.string().trim().max(200).optional(),
    /** Human-readable booking reference for manual lookup. */
    reference: z.string().trim().min(3).max(40).optional(),
  })
  .refine((value) => Boolean(value.token) || Boolean(value.reference), {
    message: 'Provide a scanned QR code or a booking reference.',
  })

export const qrCheckinBodySchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
  token: z.string().trim().max(200).optional(),
})

export const qrActivityQuerySchema = z.object({
  outcome: z.enum([
    'VALID',
    'PAYMENT_NOT_VERIFIED',
    'PAYMENT_MISMATCH',
    'NOT_FOUND',
    'REVOKED',
    'CANCELLED',
    'UNAUTHORIZED',
    'INVALID_TOKEN',
    'CHECKED_IN',
    'ALREADY_CHECKED_IN',
  ]).optional(),
  source: z.enum(['QR', 'MANUAL', 'ADMIN']).optional(),
  barberId: z.coerce.number().int().positive().optional(),
  appointmentId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export const qrAppointmentBodySchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
})

export const qrAppointmentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/** Public (guest) QR retrieval — needs both the booking reference/id and phone. */
export const publicBookingQrSchema = z.object({
  reference: z.string().trim().min(3).max(40),
  phone: z.string().trim().min(7).max(30),
})

export type QrValidateInput = z.infer<typeof qrValidateBodySchema>
export type QrCheckinInput = z.infer<typeof qrCheckinBodySchema>
export type QrActivityQuery = z.infer<typeof qrActivityQuerySchema>
export type QrAppointmentInput = z.infer<typeof qrAppointmentBodySchema>
export type PublicBookingQrInput = z.infer<typeof publicBookingQrSchema>
