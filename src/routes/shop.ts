import { Router } from 'express'
import {
  addToCartHandler,
  cancelOrderHandler,
  clearCartHandler,
  createOrderHandler,
  createReviewHandler,
  getCartHandler,
  getMyOrderHandler,
  getOrderHandler,
  getTrackingOrderHandler,
  getPaymentOptionsHandler,
  getShopPickupInfoHandler,
  getProductHandler,
  getShopSettingsHandler,
  initOrderPaystackHandler,
  linkGuestOrdersHandler,
  listBrandsHandler,
  listCategoriesHandler,
  listMyOrdersHandler,
  listProductsHandler,
  listReviewsHandler,
  lookupTrackingHandler,
  removeCartItemHandler,
  submitReceiptHandler,
  submitTransferReferenceHandler,
  trackMyOrderHandler,
  updateCartItemHandler,
  verifyOrderPaystackHandler,
} from '../controllers/shopController'
import { attachCustomerIfPresent, requireCustomer } from '../middleware/customerAuth'
import { validate } from '../middleware/validate'
import { submitLimiter } from '../middleware/rateLimiter'
import { upload } from '../utils/upload'
import {
  cartAddSchema,
  cartRemoveSchema,
  cartTokenSchema,
  cartUpdateSchema,
  checkoutSchema,
  orderLookupSchema,
  orderRefParamsSchema,
  paystackOrderVerifySchema,
  productListQuerySchema,
  productReviewSchema,
  productSlugParamsSchema,
  submitOrderReceiptSchema,
  trackingLookupSchema,
  trackingTokenParamsSchema,
  trackMyOrderSchema,
} from '../validators/shop'

export const shopRouter = Router()

// ─── Catalog (public) ────────────────────────────────────────────────────────
shopRouter.get('/settings', getShopSettingsHandler)
shopRouter.get('/pickup-info', getShopPickupInfoHandler)
shopRouter.get('/payment-options', getPaymentOptionsHandler)
shopRouter.get('/categories', listCategoriesHandler)
shopRouter.get('/brands', listBrandsHandler)
shopRouter.get('/products', validate(productListQuerySchema, 'query'), listProductsHandler)
shopRouter.get('/products/:slug', validate(productSlugParamsSchema, 'params'), getProductHandler)

// ─── Reviews ─────────────────────────────────────────────────────────────────
shopRouter.get('/products/:id/reviews', listReviewsHandler)
// attachCustomerIfPresent: a logged-in customer gets their identity attached so
// the verified-purchase check can use it; guests are rejected in the service.
shopRouter.post(
  '/products/:id/reviews',
  submitLimiter,
  attachCustomerIfPresent,
  validate(productReviewSchema),
  createReviewHandler,
)

// ─── Cart (guest token OR logged-in customer) ────────────────────────────────
shopRouter.get('/cart', attachCustomerIfPresent, getCartHandler)
shopRouter.post('/cart/items', submitLimiter, attachCustomerIfPresent, validate(cartAddSchema), addToCartHandler)
shopRouter.patch(
  '/cart/items/:itemId',
  validate(cartUpdateSchema),
  updateCartItemHandler,
)
shopRouter.delete('/cart/items/:itemId', validate(cartRemoveSchema), removeCartItemHandler)
shopRouter.post('/cart/clear', validate(cartTokenSchema), clearCartHandler)

// ─── Checkout + orders ───────────────────────────────────────────────────────
shopRouter.post(
  '/orders',
  submitLimiter,
  attachCustomerIfPresent,
  upload.single('receipt'),
  validate(checkoutSchema),
  createOrderHandler,
)
shopRouter.get('/orders', submitLimiter, validate(orderLookupSchema, 'query'), getOrderHandler)
shopRouter.post('/orders/cancel', submitLimiter, validate(orderLookupSchema), cancelOrderHandler)

// ─── Guest order tracking (secure signed link; no login / no OTP) ────────────
shopRouter.post('/track/lookup', submitLimiter, validate(trackingLookupSchema), lookupTrackingHandler)
shopRouter.get(
  '/track/:token',
  submitLimiter,
  validate(trackingTokenParamsSchema, 'params'),
  getTrackingOrderHandler,
)

// Payment for an existing order
shopRouter.post(
  '/orders/:reference/receipt',
  submitLimiter,
  upload.single('receipt'),
  validate(submitOrderReceiptSchema),
  submitReceiptHandler,
)
shopRouter.post(
  '/orders/:reference/transfer-reference',
  submitLimiter,
  validate(submitOrderReceiptSchema),
  submitTransferReferenceHandler,
)
shopRouter.post(
  '/orders/:reference/paystack/initialize',
  validate(orderRefParamsSchema, 'params'),
  initOrderPaystackHandler,
)
shopRouter.post(
  '/orders/:reference/paystack/verify',
  validate(orderRefParamsSchema, 'params'),
  validate(paystackOrderVerifySchema),
  verifyOrderPaystackHandler,
)

// ─── Customer order history (auth required) ──────────────────────────────────
shopRouter.get('/my/orders', requireCustomer, listMyOrdersHandler)
shopRouter.get('/my/orders/:reference', requireCustomer, getMyOrderHandler)
shopRouter.post('/my/link-guest-orders', requireCustomer, linkGuestOrdersHandler)
shopRouter.post('/my/track', requireCustomer, validate(trackMyOrderSchema), trackMyOrderHandler)
