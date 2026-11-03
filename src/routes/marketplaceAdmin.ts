import { Router } from 'express'
import {
  createCategoryHandler,
  createProductHandler,
  createRefundHandler,
  deleteCategoryHandler,
  deleteProductHandler,
  exportLedgerHandler,
  exportOrdersHandler,
  getOrderHandler,
  getSettingsHandler,
  getVendorHandler,
  getVendorWalletHandler,
  listCategoriesHandler,
  listLedgerHandler,
  listOrdersHandler,
  listPayoutsHandler,
  listProductsHandler,
  listReviewsHandler,
  listVendorsHandler,
  moderateProductHandler,
  moderateReviewHandler,
  overviewHandler,
  processPayoutHandler,
  rejectOrderPaymentHandler,
  resolveRefundHandler,
  updateCategoryHandler,
  updateProductHandler,
  updateOrderStatusHandler,
  updateSettingsHandler,
  updateVendorStatusHandler,
  verifyOrderPaymentHandler,
  setProductAvailabilityHandler,
  uploadSignatureHandler,
  lookupOrderPickupHandler,
  collectOrderPickupHandler,
} from '../controllers/adminMarketplaceController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { qrScanLimiter } from '../middleware/rateLimiter'
import { productMediaUpload } from '../utils/upload'
import {
  adminCategoryIdParamsSchema,
  adminCategorySchema,
  adminLedgerQuerySchema,
  adminMarketplaceSettingsSchema,
  adminOrderListQuerySchema,
  adminOrderParamsSchema,
  adminOrderStatusSchema,
  adminPayoutActionSchema,
  adminPayoutListQuerySchema,
  adminProductActionSchema,
  adminProductAvailabilitySchema,
  adminProductListQuerySchema,
  adminProductSchema,
  adminRefundRequestSchema,
  adminRejectOrderPaymentSchema,
  adminResolveRefundSchema,
  adminReviewActionSchema,
  adminReviewListQuerySchema,
  adminVendorListQuerySchema,
  adminVendorParamsSchema,
  adminVendorStatusSchema,
  adminVerifyOrderPaymentSchema,
  orderPickupCodeSchema,
  payoutIdParamsSchema,
  refundIdParamsSchema,
} from '../validators/marketplaceAdmin'

/** Admin marketplace — every route is behind requireAdmin (JWT role ADMIN). */
export const marketplaceAdminRouter = Router()
marketplaceAdminRouter.use(requireAdmin)

// Overview
marketplaceAdminRouter.get('/overview', overviewHandler)

// Vendors
marketplaceAdminRouter.get('/vendors', validate(adminVendorListQuerySchema, 'query'), listVendorsHandler)
marketplaceAdminRouter.get('/vendors/:id', validate(adminVendorParamsSchema, 'params'), getVendorHandler)
marketplaceAdminRouter.get(
  '/vendors/:id/wallet',
  validate(adminVendorParamsSchema, 'params'),
  getVendorWalletHandler,
)
marketplaceAdminRouter.patch(
  '/vendors/:id/status',
  validate(adminVendorParamsSchema, 'params'),
  validate(adminVendorStatusSchema),
  updateVendorStatusHandler,
)

// Products
marketplaceAdminRouter.get('/products', validate(adminProductListQuerySchema, 'query'), listProductsHandler)
marketplaceAdminRouter.post('/uploads/signature', uploadSignatureHandler)
marketplaceAdminRouter.post(
  '/products',
  productMediaUpload.fields([
    { name: 'images', maxCount: 8 },
    { name: 'videos', maxCount: 4 },
  ]),
  validate(adminProductSchema),
  createProductHandler,
)
marketplaceAdminRouter.put(
  '/products/:id',
  validate(adminVendorParamsSchema, 'params'),
  productMediaUpload.fields([
    { name: 'images', maxCount: 8 },
    { name: 'videos', maxCount: 4 },
  ]),
  validate(adminProductSchema),
  updateProductHandler,
)
marketplaceAdminRouter.patch(
  '/products/:id/availability',
  validate(adminVendorParamsSchema, 'params'),
  validate(adminProductAvailabilitySchema),
  setProductAvailabilityHandler,
)
marketplaceAdminRouter.post(
  '/products/:id/moderate',
  validate(adminVendorParamsSchema, 'params'),
  validate(adminProductActionSchema),
  moderateProductHandler,
)
marketplaceAdminRouter.delete('/products/:id', validate(adminVendorParamsSchema, 'params'), deleteProductHandler)

// Categories
marketplaceAdminRouter.get('/categories', listCategoriesHandler)
marketplaceAdminRouter.post('/categories', validate(adminCategorySchema), createCategoryHandler)
marketplaceAdminRouter.put(
  '/categories/:id',
  validate(adminCategoryIdParamsSchema, 'params'),
  validate(adminCategorySchema.partial()),
  updateCategoryHandler,
)
marketplaceAdminRouter.delete('/categories/:id', validate(adminCategoryIdParamsSchema, 'params'), deleteCategoryHandler)

// Orders + payments
marketplaceAdminRouter.get('/orders', validate(adminOrderListQuerySchema, 'query'), listOrdersHandler)
marketplaceAdminRouter.get('/orders/:reference', validate(adminOrderParamsSchema, 'params'), getOrderHandler)
marketplaceAdminRouter.patch(
  '/orders/:reference/status',
  validate(adminOrderParamsSchema, 'params'),
  validate(adminOrderStatusSchema),
  updateOrderStatusHandler,
)
marketplaceAdminRouter.post(
  '/orders/:reference/payment/verify',
  validate(adminOrderParamsSchema, 'params'),
  validate(adminVerifyOrderPaymentSchema),
  verifyOrderPaymentHandler,
)
marketplaceAdminRouter.post(
  '/orders/:reference/payment/reject',
  validate(adminOrderParamsSchema, 'params'),
  validate(adminRejectOrderPaymentSchema),
  rejectOrderPaymentHandler,
)

// Pickup verification (enter or scan a customer pickup code)
marketplaceAdminRouter.post(
  '/orders/pickup/lookup',
  qrScanLimiter,
  validate(orderPickupCodeSchema),
  lookupOrderPickupHandler,
)
marketplaceAdminRouter.post(
  '/orders/pickup/collect',
  qrScanLimiter,
  validate(orderPickupCodeSchema),
  collectOrderPickupHandler,
)

// Refunds
marketplaceAdminRouter.post(
  '/orders/:reference/refunds',
  validate(adminOrderParamsSchema, 'params'),
  validate(adminRefundRequestSchema),
  createRefundHandler,
)
marketplaceAdminRouter.post(
  '/refunds/:id/resolve',
  validate(refundIdParamsSchema, 'params'),
  validate(adminResolveRefundSchema),
  resolveRefundHandler,
)

// Settings
marketplaceAdminRouter.get('/settings', getSettingsHandler)
marketplaceAdminRouter.put('/settings', validate(adminMarketplaceSettingsSchema), updateSettingsHandler)

// Commission ledger + exports
marketplaceAdminRouter.get('/ledger', validate(adminLedgerQuerySchema, 'query'), listLedgerHandler)
marketplaceAdminRouter.get('/reports/orders.csv', exportOrdersHandler)
marketplaceAdminRouter.get('/reports/ledger.csv', exportLedgerHandler)

// Payouts
marketplaceAdminRouter.get('/payouts', validate(adminPayoutListQuerySchema, 'query'), listPayoutsHandler)
marketplaceAdminRouter.post(
  '/payouts/:id/process',
  validate(payoutIdParamsSchema, 'params'),
  validate(adminPayoutActionSchema),
  processPayoutHandler,
)

// Product reviews moderation
marketplaceAdminRouter.get('/reviews', validate(adminReviewListQuerySchema, 'query'), listReviewsHandler)
marketplaceAdminRouter.post(
  '/reviews/:id/moderate',
  validate(refundIdParamsSchema, 'params'),
  validate(adminReviewActionSchema),
  moderateReviewHandler,
)
