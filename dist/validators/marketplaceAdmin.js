"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminReportQuerySchema = exports.adminReviewActionSchema = exports.adminReviewListQuerySchema = exports.adminLedgerQuerySchema = exports.payoutIdParamsSchema = exports.adminPayoutActionSchema = exports.adminPayoutListQuerySchema = exports.adminMarketplaceSettingsSchema = exports.refundIdParamsSchema = exports.adminResolveRefundSchema = exports.adminRefundRequestSchema = exports.adminRejectOrderPaymentSchema = exports.adminVerifyOrderPaymentSchema = exports.adminOrderStatusSchema = exports.adminOrderParamsSchema = exports.adminOrderListQuerySchema = exports.adminCategoryIdParamsSchema = exports.adminCategorySchema = exports.adminProductActionSchema = exports.adminProductAvailabilitySchema = exports.adminProductSchema = exports.adminProductListQuerySchema = exports.adminVendorStatusSchema = exports.adminVendorParamsSchema = exports.adminVendorListQuerySchema = void 0;
const zod_1 = require("zod");
// ─── Admin: vendors ──────────────────────────────────────────────────────────
exports.adminVendorListQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']).optional(),
    search: zod_1.z.string().trim().max(150).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(50).default(15),
});
exports.adminVendorParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive(),
});
exports.adminVendorStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['APPROVED', 'SUSPENDED', 'REJECTED', 'PENDING']),
    reason: zod_1.z.string().trim().max(500).optional().or(zod_1.z.literal('')),
    commissionRate: zod_1.z.coerce.number().min(0).max(100).nullable().optional(),
});
// ─── Admin: products + categories ────────────────────────────────────────────
exports.adminProductListQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED']).optional(),
    vendorId: zod_1.z.coerce.number().int().positive().optional(),
    categoryId: zod_1.z.coerce.number().int().positive().optional(),
    search: zod_1.z.string().trim().max(200).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(50).default(15),
});
const formBoolean = zod_1.z.preprocess((value) => {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return value;
}, zod_1.z.boolean());
const existingProductImages = zod_1.z.preprocess((value) => {
    if (typeof value !== 'string')
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}, zod_1.z.array(zod_1.z.string().trim().min(1).max(1000)).max(8));
exports.adminProductSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(3).max(200),
    description: zod_1.z.string().trim().min(10).max(5000),
    brand: zod_1.z.string().trim().max(120).optional().or(zod_1.z.literal('')),
    sku: zod_1.z.string().trim().max(100).optional().or(zod_1.z.literal('')),
    categoryId: zod_1.z.preprocess((value) => value === '' || value === null ? null : value, zod_1.z.coerce.number().int().positive().nullable().optional()),
    price: zod_1.z.coerce.number().min(1),
    compareAtPrice: zod_1.z.preprocess((value) => value === '' || value === null ? null : value, zod_1.z.coerce.number().min(0).nullable().optional()),
    stock: zod_1.z.coerce.number().int().min(0).max(1_000_000),
    status: zod_1.z.enum(['DRAFT', 'ACTIVE']),
    isActive: formBoolean,
    existingImages: existingProductImages.optional().default([]),
});
exports.adminProductAvailabilitySchema = zod_1.z.object({
    isActive: zod_1.z.boolean(),
});
exports.adminProductActionSchema = zod_1.z.object({
    // `action` MUST be declared here: `validate()` replaces req.body with the
    // parsed result, so an undeclared key would be stripped before the handler
    // reads it and moderation would silently do nothing.
    action: zod_1.z.enum(['APPROVED', 'REJECTED']),
    reason: zod_1.z.string().trim().max(500).optional().or(zod_1.z.literal('')),
});
exports.adminCategorySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120),
    description: zod_1.z.string().trim().max(1000).optional().or(zod_1.z.literal('')),
    commissionRate: zod_1.z.coerce.number().min(0).max(100).nullable().optional(),
    isActive: zod_1.z.boolean().optional(),
    sortOrder: zod_1.z.coerce.number().int().optional(),
});
exports.adminCategoryIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive(),
});
// ─── Admin: orders, payments, refunds ────────────────────────────────────────
exports.adminOrderListQuerySchema = zod_1.z.object({
    status: zod_1.z
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
    paymentStatus: zod_1.z.enum(['UNPAID', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'REFUNDED', 'CANCELLED']).optional(),
    vendorId: zod_1.z.coerce.number().int().positive().optional(),
    search: zod_1.z.string().trim().max(150).optional(),
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(50).default(15),
});
exports.adminOrderParamsSchema = zod_1.z.object({
    reference: zod_1.z.string().trim().min(3).max(30),
});
exports.adminOrderStatusSchema = zod_1.z.object({
    status: zod_1.z.enum([
        'PROCESSING',
        'READY_FOR_DISPATCH',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED',
        'RETURNED',
    ]),
    reason: zod_1.z.string().trim().max(500).optional().or(zod_1.z.literal('')),
});
exports.adminVerifyOrderPaymentSchema = zod_1.z.object({
    note: zod_1.z.string().trim().max(1000).optional().or(zod_1.z.literal('')),
});
exports.adminRejectOrderPaymentSchema = zod_1.z.object({
    reason: zod_1.z.string().trim().min(3).max(1000),
});
exports.adminRefundRequestSchema = zod_1.z.object({
    reason: zod_1.z.string().trim().min(3).max(2000),
    amount: zod_1.z.coerce.number().min(0).optional(),
    vendorId: zod_1.z.coerce.number().int().positive().optional(),
});
exports.adminResolveRefundSchema = zod_1.z.object({
    action: zod_1.z.enum(['APPROVED', 'REJECTED']),
    resolution: zod_1.z.string().trim().max(500).optional().or(zod_1.z.literal('')),
});
exports.refundIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive(),
});
// ─── Admin: settings, payouts, reports ───────────────────────────────────────
exports.adminMarketplaceSettingsSchema = zod_1.z.object({
    defaultCommissionRate: zod_1.z.coerce.number().min(0).max(100),
    commissionType: zod_1.z.enum(['PERCENTAGE', 'FIXED']),
    releaseDelayDays: zod_1.z.coerce.number().int().min(0).max(90),
    deliveryFee: zod_1.z.coerce.number().min(0).max(100000),
    freeDeliveryThreshold: zod_1.z.coerce.number().min(0),
    deliveryLocations: zod_1.z.string().max(500).optional().or(zod_1.z.literal('')),
    requireProductApproval: zod_1.z.boolean(),
    allowGuestCheckout: zod_1.z.boolean(),
    vendorRegistrationOpen: zod_1.z.boolean(),
});
exports.adminPayoutListQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'PAID']).optional(),
    vendorId: zod_1.z.coerce.number().int().positive().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(50).default(15),
});
exports.adminPayoutActionSchema = zod_1.z.object({
    action: zod_1.z.enum(['APPROVED', 'REJECTED', 'PAID']),
    transactionRef: zod_1.z.string().trim().max(191).optional().or(zod_1.z.literal('')),
    note: zod_1.z.string().trim().max(500).optional().or(zod_1.z.literal('')),
});
exports.payoutIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive(),
});
exports.adminLedgerQuerySchema = zod_1.z.object({
    vendorId: zod_1.z.coerce.number().int().positive().optional(),
    settlementStatus: zod_1.z.enum(['PENDING', 'RELEASED', 'PAID', 'REVERSED']).optional(),
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(50).default(20),
});
exports.adminReviewListQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    search: zod_1.z.string().trim().max(150).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(50).default(15),
});
exports.adminReviewActionSchema = zod_1.z.object({
    action: zod_1.z.enum(['APPROVED', 'REJECTED']),
});
exports.adminReportQuerySchema = zod_1.z.object({
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    vendorId: zod_1.z.coerce.number().int().positive().optional(),
    format: zod_1.z.enum(['json', 'csv']).default('json'),
});
//# sourceMappingURL=marketplaceAdmin.js.map