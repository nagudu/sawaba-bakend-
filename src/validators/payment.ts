import { z } from 'zod'

export const PAYMENT_METHODS = ['OPAY', 'BANK_TRANSFER', 'CASH', 'OTHER'] as const

export const paymentTokenParamsSchema = z.object({
  token: z.string().trim().min(16).max(64),
})

export const paymentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive('Payment id must be a positive integer.'),
})

export const submitPaymentSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  amountPaid: z.coerce.number().min(0, 'Amount paid cannot be negative.'),
  transactionReference: z.string().trim().max(191).optional().default(''),
  paymentDate: z.string().date('Provide a valid payment date (YYYY-MM-DD).'),
  note: z.string().trim().max(1000).optional().nullable(),
})

export const trackPaymentSchema = z.object({
  appointmentId: z
    .string()
    .trim()
    .min(2, 'Provide a valid appointment ID.')
    .max(30, 'Provide a valid appointment ID.'),
  phone: z.string().trim().min(7).max(30),
})

export const listPaymentsQuerySchema = z.object({
  status: z
    .enum(['UNPAID', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'REFUNDED', 'CANCELLED'])
    .optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  from: z.string().date('Provide a valid from date (YYYY-MM-DD).').optional(),
  to: z.string().date('Provide a valid to date (YYYY-MM-DD).').optional(),
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
})

export const rejectPaymentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Please provide a reason for rejecting this payment.')
    .max(1000),
})

export const cashConfirmSchema = z.object({
  note: z.string().trim().max(1000).optional().nullable(),
})

export const paystackVerifySchema = z.object({
  reference: z.string().trim().min(4).max(191),
})

export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>
export type TrackPaymentInput = z.infer<typeof trackPaymentSchema>
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>
export type CashConfirmInput = z.infer<typeof cashConfirmSchema>
export type PaystackVerifyInput = z.infer<typeof paystackVerifySchema>