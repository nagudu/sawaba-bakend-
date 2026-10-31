import { z } from 'zod'

// ─── Public shop ─────────────────────────────────────────────────────────────

export const productListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(140).optional(),
  brand: z.string().trim().max(120).optional(),
  vendor: z.coerce.number().int().positive().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'rating', 'popular']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
})

export const productSlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(220),
})

export const cartTokenSchema = z.object({
  token: z.string().trim().min(10).max(64),
})

export const cartAddSchema = z.object({
  token: z.string().trim().min(10).max(64).optional(),
  productId: z.coerce.number().int().positive(),
  variationId: z.coerce.number().int().positive().optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
})

export const cartItemParamsSchema = z.object({
  itemId: z.coerce.number().int().positive(),
})

export const cartUpdateSchema = z.object({
  token: z.string().trim().min(10).max(64),
  quantity: z.coerce.number().int().min(0).max(99),
})

export const cartRemoveSchema = z.object({
  token: z.string().trim().min(10).max(64),
})

export const checkoutSchema = z
  .object({
    token: z.string().trim().min(10).max(64).optional(),
    items: z
      .array(
        z.object({
          productId: z.coerce.number().int().positive(),
          variationId: z.coerce.number().int().positive().optional().nullable(),
          quantity: z.coerce.number().int().min(1).max(99),
        }),
      )
      .min(1)
      .max(50)
      .optional(),
    customerName: z.string().trim().min(2).max(150),
    customerPhone: z.string().trim().min(7).max(30),
    customerEmail: z.string().trim().email('A valid email is required for order notifications.').max(255).optional().or(z.literal('')),
    deliveryAddress: z.string().trim().min(5).max(400),
    deliveryLocation: z.string().trim().max(150).optional().or(z.literal('')),
    notes: z.string().trim().max(1000).optional().or(z.literal('')),
    paymentMethod: z.enum(['BANK_TRANSFER', 'OPAY', 'ONLINE', 'CASH']),
    /** Pay-on-delivery is only valid when the marketplace allows it. */
    payOnDelivery: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.token) || Boolean(value.items?.length), {
    message: 'Your cart is empty.',
  })

export const orderLookupSchema = z.object({
  reference: z.string().trim().min(3).max(30),
  phone: z.string().trim().min(7).max(30),
})

export const orderRefParamsSchema = z.object({
  reference: z.string().trim().min(3).max(30),
})

export const submitOrderReceiptSchema = z.object({
  reference: z.string().trim().min(3).max(30),
  transactionReference: z.string().trim().max(191).optional().or(z.literal('')),
})

export const paystackOrderVerifySchema = z.object({
  reference: z.string().trim().min(3).max(191),
})

export const productReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(3).max(2000),
  customerName: z.string().trim().min(2).max(150).optional(),
})

export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(10),
})

// ─── Vendor auth + registration ──────────────────────────────────────────────

export const vendorRegisterSchema = z.object({
  businessName: z.string().trim().min(2).max(150),
  contactName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(30),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(72),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  location: z.string().trim().max(150).optional().or(z.literal('')),
  bankName: z.string().trim().max(100).optional().or(z.literal('')),
  bankAccountName: z.string().trim().max(150).optional().or(z.literal('')),
  bankAccountNumber: z.string().trim().max(30).optional().or(z.literal('')),
  businessInfo: z.string().trim().max(3000).optional().or(z.literal('')),
})

export const vendorLoginSchema = z.object({
  identifier: z.string().trim().min(3).max(255),
  password: z.string().min(1).max(72),
})

export const vendorProfileUpdateSchema = z.object({
  contactName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  location: z.string().trim().max(150).optional().or(z.literal('')),
  bankName: z.string().trim().max(100).optional().or(z.literal('')),
  bankAccountName: z.string().trim().max(150).optional().or(z.literal('')),
  bankAccountNumber: z.string().trim().max(30).optional().or(z.literal('')),
  businessInfo: z.string().trim().max(3000).optional().or(z.literal('')),
})

export const vendorChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
})

// ─── Vendor product management ───────────────────────────────────────────────

const variationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(120),
  priceDelta: z.coerce.number().optional().default(0),
})

export const vendorProductSchema = z.object({
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  brand: z.string().trim().max(120).optional().or(z.literal('')),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  price: z.coerce.number().min(1, 'Price must be at least ₦1.'),
  compareAtPrice: z.coerce.number().min(0).optional().nullable().or(z.literal('')),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000).optional(),
  // The product form posts multipart/form-data (it carries images), so a JSON
  // array field arrives as a string — parse it before validating instead of
  // rejecting every product that has variations.
  variations: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      if (!trimmed) return undefined
      try {
        return JSON.parse(trimmed)
      } catch {
        return value
      }
    },
    z.array(variationSchema).max(30).optional(),
  ),
  imagesJson: z.string().max(6000).optional(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW']).optional(),
})

export const vendorProductIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const vendorOrderListQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(15),
})

export const vendorItemUpdateSchema = z.object({
  status: z.enum(['CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  trackingInfo: z.string().trim().max(300).optional().or(z.literal('')),
  cancelReason: z.string().trim().max(500).optional().or(z.literal('')),
})

export const vendorItemParamsSchema = z.object({
  itemId: z.coerce.number().int().positive(),
})

export const vendorPayoutRequestSchema = z.object({
  amount: z.coerce.number().min(100, 'Minimum payout is ₦100.'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

export type ProductListQuery = z.infer<typeof productListQuerySchema>
export type CartAddInput = z.infer<typeof cartAddSchema>
export type CheckoutInput = z.infer<typeof checkoutSchema>
export type VendorRegisterInput = z.infer<typeof vendorRegisterSchema>
export type VendorLoginInput = z.infer<typeof vendorLoginSchema>
export type VendorProfileUpdateInput = z.infer<typeof vendorProfileUpdateSchema>
export type VendorProductInput = z.infer<typeof vendorProductSchema>
export type VendorItemUpdateInput = z.infer<typeof vendorItemUpdateSchema>
export type VendorPayoutRequestInput = z.infer<typeof vendorPayoutRequestSchema>
