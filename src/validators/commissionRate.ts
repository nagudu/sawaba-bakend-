import { z } from 'zod'

export const commissionRateListSchema = z.object({
  barberId: z.coerce.number().int().positive().optional(),
  commissionType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
})

export const commissionRateHistorySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
})

export const commissionRateUpdateSchema = z
  .object({
    commissionType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
    commissionValue: z.coerce.number().min(0).optional(),
    effectiveFrom: z.coerce.date().optional(),
  })
  .refine(
    (v) => v.commissionType !== undefined || v.commissionValue !== undefined,
    { message: 'Provide either commissionType or commissionValue to update the rate.' },
  )
  .refine(
    // FIXED commissions are naira amounts (can exceed 100); only PERCENTAGE is capped.
    (v) => v.commissionType !== 'PERCENTAGE' || v.commissionValue === undefined || v.commissionValue <= 100,
    { message: 'Percentage commission must be between 0 and 100.' },
  )

export type CommissionRateListQuery = z.infer<typeof commissionRateListSchema>
export type CommissionRateHistoryQuery = z.infer<typeof commissionRateHistorySchema>
export type CommissionRateUpdate = z.infer<typeof commissionRateUpdateSchema>
