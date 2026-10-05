import { z } from 'zod'

export const barberPortalQuerySchema = z.object({
  /** Appointment date bounds (YYYY-MM-DD — matches appointmentDate column). */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  status: z
    .enum([
      'PAYMENT_REQUIRED',
      'PAYMENT_SUBMITTED',
      'PAYMENT_VERIFIED',
      'PAYMENT_REJECTED',
      'READY_FOR_SERVICE',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ])
    .optional(),
  /** Ledger filter for the earnings list (PENDING → EARNED → PAID lifecycle). */
  earningStatus: z.enum(['PENDING', 'EARNED', 'PAID', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export const barberAppointmentTimeParamsSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
})

export const barberMarkNotificationReadSchema = z.object({
  /** Marks ALL notifications read when omitted. */
  notificationId: z.coerce.number().int().positive().optional(),
})

export const barberAvailabilityInputSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm.'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm.'),
  isAvailable: z.boolean({ required_error: 'isAvailable is required.' }),
})

/** The portal saves a whole weekly schedule in one PUT, so the body is a list of entries. A single entry stays accepted for backwards compatibility. */
export const barberAvailabilityBodySchema = z.union([barberAvailabilityInputSchema, z.array(barberAvailabilityInputSchema)])

export type BarberPortalQuery = z.infer<typeof barberPortalQuerySchema>
export type BarberAppointmentTimeParams = z.infer<typeof barberAppointmentTimeParamsSchema>
export type BarberMarkNotificationReadInput = z.infer<typeof barberMarkNotificationReadSchema>
export type BarberAvailabilityInput = z.infer<typeof barberAvailabilityInputSchema>
export type BarberAvailabilityBody = z.infer<typeof barberAvailabilityBodySchema>