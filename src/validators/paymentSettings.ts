import { z } from 'zod'
import { PAYMENT_METHODS } from './payment'

export const updatePaymentSettingsSchema = z.object({
  shopName: z.string().trim().min(2).max(150).optional(),
  shopAddress: z.string().trim().max(300).optional().nullable(),
  shopPhone: z.string().trim().max(30).optional().nullable(),
  shopLogo: z.string().trim().url('Logo must be a valid URL.').max(500).optional().nullable(),
  bankName: z.string().trim().max(100).optional().nullable(),
  accountName: z.string().trim().max(150).optional().nullable(),
  accountNumber: z.string().trim().max(30).optional().nullable(),
  opayAccountName: z.string().trim().max(150).optional().nullable(),
  opayAccountNumber: z.string().trim().max(30).optional().nullable(),
  paymentInstructions: z.string().trim().max(5000).optional().nullable(),
  enabledPaymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(8).optional(),
  minAmount: z.coerce.number().min(0, 'Minimum amount cannot be negative.').optional(),
  fullPaymentRequired: z.coerce.boolean().optional(),
  receiptRequired: z.coerce.boolean().optional(),
})

export type UpdatePaymentSettingsInput = z.infer<typeof updatePaymentSettingsSchema>