"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vendorPayoutRequestSchema = exports.vendorItemParamsSchema = exports.vendorItemUpdateSchema = exports.vendorOrderListQuerySchema = exports.vendorProductIdParamsSchema = exports.vendorProductSchema = exports.vendorChangePasswordSchema = exports.vendorProfileUpdateSchema = exports.vendorLoginSchema = exports.vendorRegisterSchema = exports.reviewListQuerySchema = exports.productReviewSchema = exports.paystackOrderVerifySchema = exports.submitOrderReceiptSchema = exports.orderRefParamsSchema = exports.orderLookupSchema = exports.checkoutSchema = exports.cartRemoveSchema = exports.cartUpdateSchema = exports.cartItemParamsSchema = exports.cartAddSchema = exports.cartTokenSchema = exports.productSlugParamsSchema = exports.productListQuerySchema = void 0;
const zod_1 = require("zod");
// ─── Public shop ─────────────────────────────────────────────────────────────
exports.productListQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(120).optional(),
    category: zod_1.z.string().trim().max(140).optional(),
    brand: zod_1.z.string().trim().max(120).optional(),
    vendor: zod_1.z.coerce.number().int().positive().optional(),
    minPrice: zod_1.z.coerce.number().min(0).optional(),
    maxPrice: zod_1.z.coerce.number().min(0).optional(),
    sort: zod_1.z.enum(['newest', 'price_asc', 'price_desc', 'rating', 'popular']).default('newest'),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(48).default(12),
});
exports.productSlugParamsSchema = zod_1.z.object({
    slug: zod_1.z.string().trim().min(1).max(220),
});
exports.cartTokenSchema = zod_1.z.object({
    token: zod_1.z.string().trim().min(10).max(64),
});
exports.cartAddSchema = zod_1.z.object({
    token: zod_1.z.string().trim().min(10).max(64).optional(),
    productId: zod_1.z.coerce.number().int().positive(),
    variationId: zod_1.z.coerce.number().int().positive().optional().nullable(),
    quantity: zod_1.z.coerce.number().int().min(1).max(99).default(1),
});
exports.cartItemParamsSchema = zod_1.z.object({
    itemId: zod_1.z.coerce.number().int().positive(),
});
exports.cartUpdateSchema = zod_1.z.object({
    token: zod_1.z.string().trim().min(10).max(64),
    quantity: zod_1.z.coerce.number().int().min(0).max(99),
});
exports.cartRemoveSchema = zod_1.z.object({
    token: zod_1.z.string().trim().min(10).max(64),
});
exports.checkoutSchema = zod_1.z
    .object({
    token: zod_1.z.string().trim().min(10).max(64).optional(),
    items: zod_1.z
        .array(zod_1.z.object({
        productId: zod_1.z.coerce.number().int().positive(),
        variationId: zod_1.z.coerce.number().int().positive().optional().nullable(),
        quantity: zod_1.z.coerce.number().int().min(1).max(99),
    }))
        .min(1)
        .max(50)
        .optional(),
    customerName: zod_1.z.string().trim().min(2).max(150),
    customerPhone: zod_1.z.string().trim().min(7).max(30),
    customerEmail: zod_1.z.string().trim().email('A valid email is required for order notifications.').max(255).optional().or(zod_1.z.literal('')),
    deliveryAddress: zod_1.z.string().trim().min(5).max(400),
    deliveryLocation: zod_1.z.string().trim().max(150).optional().or(zod_1.z.literal('')),
    notes: zod_1.z.string().trim().max(1000).optional().or(zod_1.z.literal('')),
    paymentMethod: zod_1.z.enum(['BANK_TRANSFER', 'OPAY', 'ONLINE', 'CASH']),
    /** Pay-on-delivery is only valid when the marketplace allows it. */
    payOnDelivery: zod_1.z.boolean().optional(),
})
    .refine((value) => Boolean(value.token) || Boolean(value.items?.length), {
    message: 'Your cart is empty.',
});
exports.orderLookupSchema = zod_1.z.object({
    reference: zod_1.z.string().trim().min(3).max(30),
    phone: zod_1.z.string().trim().min(7).max(30),
});
exports.orderRefParamsSchema = zod_1.z.object({
    reference: zod_1.z.string().trim().min(3).max(30),
});
exports.submitOrderReceiptSchema = zod_1.z.object({
    reference: zod_1.z.string().trim().min(3).max(30),
    transactionReference: zod_1.z.string().trim().max(191).optional().or(zod_1.z.literal('')),
});
exports.paystackOrderVerifySchema = zod_1.z.object({
    reference: zod_1.z.string().trim().min(3).max(191),
});
exports.productReviewSchema = zod_1.z.object({
    rating: zod_1.z.coerce.number().int().min(1).max(5),
    comment: zod_1.z.string().trim().min(3).max(2000),
    customerName: zod_1.z.string().trim().min(2).max(150).optional(),
});
exports.reviewListQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(50).default(10),
});
// ─── Vendor auth + registration ──────────────────────────────────────────────
exports.vendorRegisterSchema = zod_1.z.object({
    businessName: zod_1.z.string().trim().min(2).max(150),
    contactName: zod_1.z.string().trim().min(2).max(150),
    email: zod_1.z.string().trim().email().max(255),
    phone: zod_1.z.string().trim().min(7).max(30),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters.').max(72),
    address: zod_1.z.string().trim().max(300).optional().or(zod_1.z.literal('')),
    location: zod_1.z.string().trim().max(150).optional().or(zod_1.z.literal('')),
    bankName: zod_1.z.string().trim().max(100).optional().or(zod_1.z.literal('')),
    bankAccountName: zod_1.z.string().trim().max(150).optional().or(zod_1.z.literal('')),
    bankAccountNumber: zod_1.z.string().trim().max(30).optional().or(zod_1.z.literal('')),
    businessInfo: zod_1.z.string().trim().max(3000).optional().or(zod_1.z.literal('')),
});
exports.vendorLoginSchema = zod_1.z.object({
    identifier: zod_1.z.string().trim().min(3).max(255),
    password: zod_1.z.string().min(1).max(72),
});
exports.vendorProfileUpdateSchema = zod_1.z.object({
    contactName: zod_1.z.string().trim().min(2).max(150).optional(),
    phone: zod_1.z.string().trim().min(7).max(30).optional(),
    address: zod_1.z.string().trim().max(300).optional().or(zod_1.z.literal('')),
    location: zod_1.z.string().trim().max(150).optional().or(zod_1.z.literal('')),
    bankName: zod_1.z.string().trim().max(100).optional().or(zod_1.z.literal('')),
    bankAccountName: zod_1.z.string().trim().max(150).optional().or(zod_1.z.literal('')),
    bankAccountNumber: zod_1.z.string().trim().max(30).optional().or(zod_1.z.literal('')),
    businessInfo: zod_1.z.string().trim().max(3000).optional().or(zod_1.z.literal('')),
});
exports.vendorChangePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8).max(72),
});
// ─── Vendor product management ───────────────────────────────────────────────
const variationSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(80),
    value: zod_1.z.string().trim().min(1).max(120),
    priceDelta: zod_1.z.coerce.number().optional().default(0),
});
exports.vendorProductSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(3).max(200),
    description: zod_1.z.string().trim().min(10).max(5000),
    brand: zod_1.z.string().trim().max(120).optional().or(zod_1.z.literal('')),
    categoryId: zod_1.z.coerce.number().int().positive().optional().nullable(),
    price: zod_1.z.coerce.number().min(1, 'Price must be at least ₦1.'),
    compareAtPrice: zod_1.z.coerce.number().min(0).optional().nullable().or(zod_1.z.literal('')),
    stock: zod_1.z.coerce.number().int().min(0).max(1_000_000),
    lowStockThreshold: zod_1.z.coerce.number().int().min(0).max(1000).optional(),
    // The product form posts multipart/form-data (it carries images), so a JSON
    // array field arrives as a string — parse it before validating instead of
    // rejecting every product that has variations.
    variations: zod_1.z.preprocess((value) => {
        if (typeof value !== 'string')
            return value;
        const trimmed = value.trim();
        if (!trimmed)
            return undefined;
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return value;
        }
    }, zod_1.z.array(variationSchema).max(30).optional()),
    imagesJson: zod_1.z.string().max(6000).optional(),
    status: zod_1.z.enum(['DRAFT', 'PENDING_REVIEW']).optional(),
});
exports.vendorProductIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive(),
});
exports.vendorOrderListQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']).optional(),
    search: zod_1.z.string().trim().max(120).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(50).default(15),
});
exports.vendorItemUpdateSchema = zod_1.z.object({
    status: zod_1.z.enum(['CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
    trackingInfo: zod_1.z.string().trim().max(300).optional().or(zod_1.z.literal('')),
    cancelReason: zod_1.z.string().trim().max(500).optional().or(zod_1.z.literal('')),
});
exports.vendorItemParamsSchema = zod_1.z.object({
    itemId: zod_1.z.coerce.number().int().positive(),
});
exports.vendorPayoutRequestSchema = zod_1.z.object({
    amount: zod_1.z.coerce.number().min(100, 'Minimum payout is ₦100.'),
    note: zod_1.z.string().trim().max(500).optional().or(zod_1.z.literal('')),
});
//# sourceMappingURL=shop.js.map