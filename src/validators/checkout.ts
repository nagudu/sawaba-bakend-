import { z } from 'zod'
import { BOOKING_PAYMENT_METHODS } from './appointment'

const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Creating the checkout SESSION is not booking — it only stages the payment
 * step. It deliberately requires paymentMethod so the payment condition is
 * explicit from the start.
 */
export const createCheckoutSchema = z.object({
  customerName: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
  customerPhone: z.string().trim().regex(PHONE_PATTERN, 'Provide a valid phone number.'),
  customerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Provide a valid email address.')
    .optional()
    .nullable()
    .or(z.literal('')),
  serviceId: z.coerce.number().int().positive('A valid service is required.'),
  barberId: z.coerce.number().int().positive('A valid barber is required.'),
  /** Customer's location/area — optional, admin-assignment context only. */
  customerLocation: z
    .string()
    .trim()
    .max(150)
    .optional()
    .nullable()
    .or(z.literal('')),
  appointmentDate: z.string().date('Provide a valid date (YYYY-MM-DD).'),
  appointmentTime: z.string().regex(TIME_PATTERN, 'Provide a valid time in HH:mm format.'),
  notes: z.string().trim().max(2000).optional().nullable().or(z.literal('')),
  paymentMethod: z.enum(BOOKING_PAYMENT_METHODS, {
    errorMap: () => ({ message: 'Payment method is required.' }),
  }),
  transactionReference: z.string().trim().max(191).optional().default(''),
})

export const sessionTokenParamsSchema = z.object({
  sessionToken: z.string().trim().min(16).max(64),
})

export const checkoutVerifySchema = z.object({
  reference: z.string().trim().min(4).max(191),
})

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>
