import { z } from 'zod'
import { APPOINTMENT_STATUSES } from '../types'

const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive('Id must be a positive integer.'),
})/** Methods a customer may choose at booking time. ONLINE means Paystack checkout. */
export const BOOKING_PAYMENT_METHODS = ['OPAY', 'BANK_TRANSFER', 'CASH', 'OTHER', 'ONLINE'] as const

/** Multipart fields arrive as strings — empty ones must become undefined, not ''. */
const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value)

export const createAppointmentSchema = z
  .object({
    customerName: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
    customerPhone: z
      .string()
      .trim()
      .regex(PHONE_PATTERN, 'Provide a valid phone number.'),
    customerEmail: z.preprocess(
      emptyToUndefined,
      z.string().trim().toLowerCase().email('Provide a valid email address.').optional().nullable(),
    ),
    /** Customer's location/area — optional context that helps admin choose the right barber. Never auto-assigns. */
    customerLocation: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(150).optional().nullable().or(z.literal('')),
    ),
    serviceId: z.coerce.number().int().positive('A valid service is required.'),
    barberId: z.coerce.number().int().positive('A valid barber is required.'),
    appointmentDate: z.string().date('Provide a valid date (YYYY-MM-DD).'),
    appointmentTime: z
      .string()
      .regex(TIME_PATTERN, 'Provide a valid time in HH:mm format.'),
    notes: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional().nullable()),
    // Payment rules are enforced in the service layer (enabled-methods check +
    // mandatory receipt for non-cash, non-online methods).
    paymentMethod: z.enum(BOOKING_PAYMENT_METHODS, {
      errorMap: () => ({ message: 'Choose a payment method to submit your appointment.' }),
    }),
    transactionReference: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(191).optional().default(''),
    ),
  })
  .superRefine((data, ctx) => {
    const selected = new Date(`${data.appointmentDate}T${data.appointmentTime}:00`)
    if (Number.isNaN(selected.getTime())) {
      ctx.addIssue({ code: 'custom', path: ['appointmentDate'], message: 'Provide a valid date.' })
      return
    }
    // Compare date-only (YYYY-MM-DD) so timezone differences between the
    // browser and server never cause a valid same-day booking to be rejected.
    // Slot-level conflict checks (including time-in-the-past) are handled in
    // the service layer where we have full context.
    const todayISO = new Date().toISOString().slice(0, 10)
    if (data.appointmentDate < todayISO) {
      ctx.addIssue({
        code: 'custom',
        path: ['appointmentDate'],
        message: 'Appointments cannot be booked in the past.',
      })
    }
  })

export const updateAppointmentSchema = z
  .object({
    customerName: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150).optional(),
    customerPhone: z.string().trim().regex(PHONE_PATTERN, 'Provide a valid phone number.').optional(),
    customerEmail: z.string().trim().toLowerCase().email('Provide a valid email address.').optional().nullable(),
    customerLocation: z.string().trim().max(150).optional().nullable(),
    serviceId: z.coerce.number().int().positive('A valid service is required.').optional(),
    /** Admin-only reassignment via PATCH /appointments/:id. Never accepted from customers. */
    barberId: z.coerce.number().int().positive('A valid barber is required.').optional(),
    appointmentDate: z.string().date('Provide a valid date (YYYY-MM-DD).').optional(),
    appointmentTime: z.string().regex(TIME_PATTERN, 'Provide a valid time in HH:mm format.').optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.appointmentDate && data.appointmentTime) {
      const selected = new Date(`${data.appointmentDate}T${data.appointmentTime}:00`)
      if (Number.isNaN(selected.getTime())) {
        ctx.addIssue({ code: 'custom', path: ['appointmentDate'], message: 'Provide a valid date.' })
        return
      }
      const todayISO = new Date().toISOString().slice(0, 10)
      if (data.appointmentDate < todayISO) {
        ctx.addIssue({
          code: 'custom',
          path: ['appointmentDate'],
          message: 'Appointments cannot be booked in the past.',
        })
      }
    }
  })

const statusEnum = z.enum(APPOINTMENT_STATUSES as [string, ...string[]])

export const appointmentStatusSchema = z.object({
  status: statusEnum,
  cancellationReason: z.string().trim().max(500).optional().nullable(),
})

export const listAppointmentsQuerySchema = z.object({
  status: statusEnum.optional(),
  barberId: z.coerce.number().int().positive().optional(),
  serviceId: z.coerce.number().int().positive().optional(),
  from: z.string().date('Provide a valid from date (YYYY-MM-DD).').optional(),
  to: z.string().date('Provide a valid to date (YYYY-MM-DD).').optional(),
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export const availabilityQuerySchema = z.object({
  barberId: z.coerce.number().int().positive('A valid barber id is required.'),
  date: z.string().date('Provide a valid date (YYYY-MM-DD).'),
})

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>
export type BookingPaymentMethod = (typeof BOOKING_PAYMENT_METHODS)[number]
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>