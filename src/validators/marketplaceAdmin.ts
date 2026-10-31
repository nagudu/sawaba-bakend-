import { z } from 'zod'

// ─── Admin: vendors ──────────────────────────────────────────────────────────

export const adminVendorListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']).optional(),
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(15),
})

export const adminVendorParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const adminVendorStatusSchema = z.object({
  status: z.enum(['APPROVED', 'SUSPENDED', 'REJECTED', 'PENDING']),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
  commissionRate: z.coerce.number().min(0).max(100).nullable().optional(),
})

// ─── Admin: products + categories ────────────────────────────────────────────

export const adminProductListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED']).optional(),
  vendorId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(15),
})

const formBoolean = z.preprocess((value) => {
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}, z.boolean())

const existingProductImages = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}, z.array(z.string().trim().min(1).max(1000)).max(8))

export const adminProductSchema = z.object({
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  brand: z.string().trim().max(120).optional().or(z.literal('')),
  sku: z.string().trim().max(100).optional().or(z.literal('')),
  categoryId: z.preprocess((value) => value === '' || value === null ? null : value,
    z.coerce.number().int().positive().nullable().optional()),
  price: z.coerce.number().min(1),
  compareAtPrice: z.preprocess((value) => value === '' || value === null ? null : value,
    z.coerce.number().min(0).nullable().optional()),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  status: z.enum(['DRAFT', 'ACTIVE']),
  isActive: formBoolean,
  existingImages: existingProductImages.optional().default([]),
})

export const adminProductAvailabilitySchema = z.object({
  isActive: z.boolean(),
})

export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>
export type AdminProductInput = z.infer<typeof adminProductSchema>

export const adminProductActionSchema = z.object({
  // `action` MUST be declared here: `validate()` replaces req.body with the
  // parsed result, so an undeclared key would be stripped before the handler
  // reads it and moderation would silently do nothing.
  action: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
})

export const adminCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  commissionRate: z.coerce.number().min(0).max(100).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
})

export const adminCategoryIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

// ─── Admin: orders, payments, refunds ────────────────────────────────────────

export const adminOrderListQuerySchema = z.object({
  status: z
    .enum([
      'AWAITING_PAYMENT',
      'PAYMENT_CONFIRMED',
      'PROCESSING',
      'READY_FOR_DISPATCH',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'RETURN_REQUESTED',
      'RETURNED',
      'REFUNDED',
    ])
    .optional(),
  paymentStatus: z.enum(['UNPAID', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'REFUNDED', 'CANCELLED']).optional(),
  vendorId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(150).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(15),
})

export const adminOrderParamsSchema = z.object({
  reference: z.string().trim().min(3).max(30),
})

export const adminOrderStatusSchema = z.object({
  status: z.enum([
    'PROCESSING',
    'READY_FOR_DISPATCH',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURNED',
  ]),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
})

export const adminVerifyOrderPaymentSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal('')),
})

export const adminRejectOrderPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

export const adminRefundRequestSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
  amount: z.coerce.number().min(0).optional(),
  vendorId: z.coerce.number().int().positive().optional(),
})

export const adminResolveRefundSchema = z.object({
  action: z.enum(['APPROVED', 'REJECTED']),
  resolution: z.string().trim().max(500).optional().or(z.literal('')),
})

export const refundIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

// ─── Admin: settings, payouts, reports ───────────────────────────────────────

export const adminMarketplaceSettingsSchema = z.object({
  defaultCommissionRate: z.coerce.number().min(0).max(100),
  commissionType: z.enum(['PERCENTAGE', 'FIXED']),
  releaseDelayDays: z.coerce.number().int().min(0).max(90),
  deliveryFee: z.coerce.number().min(0).max(100000),
  freeDeliveryThreshold: z.coerce.number().min(0),
  deliveryLocations: z.string().max(500).optional().or(z.literal('')),
  requireProductApproval: z.boolean(),
  allowGuestCheckout: z.boolean(),
  vendorRegistrationOpen: z.boolean(),
})

export const adminPayoutListQuerySchema = z.object({
  status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'PAID']).optional(),
  vendorId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(15),
})

export const adminPayoutActionSchema = z.object({
  action: z.enum(['APPROVED', 'REJECTED', 'PAID']),
  transactionRef: z.string().trim().max(191).optional().or(z.literal('')),
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

export const payoutIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const adminLedgerQuerySchema = z.object({
  vendorId: z.coerce.number().int().positive().optional(),
  settlementStatus: z.enum(['PENDING', 'RELEASED', 'PAID', 'REVERSED']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
})

export const adminReviewListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(15),
})

export const adminReviewActionSchema = z.object({
  action: z.enum(['APPROVED', 'REJECTED']),
})

export const adminReportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  vendorId: z.coerce.number().int().positive().optional(),
  format: z.enum(['json', 'csv']).default('json'),
})

export type AdminVendorListQuery = z.infer<typeof adminVendorListQuerySchema>
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>
export type AdminLedgerQuery = z.infer<typeof adminLedgerQuerySchema>
