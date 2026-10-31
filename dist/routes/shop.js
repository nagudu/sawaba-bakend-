"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopRouter = void 0;
const express_1 = require("express");
const shopController_1 = require("../controllers/shopController");
const customerAuth_1 = require("../middleware/customerAuth");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const upload_1 = require("../utils/upload");
const shop_1 = require("../validators/shop");
exports.shopRouter = (0, express_1.Router)();
// ─── Catalog (public) ────────────────────────────────────────────────────────
exports.shopRouter.get('/settings', shopController_1.getShopSettingsHandler);
exports.shopRouter.get('/categories', shopController_1.listCategoriesHandler);
exports.shopRouter.get('/brands', shopController_1.listBrandsHandler);
exports.shopRouter.get('/products', (0, validate_1.validate)(shop_1.productListQuerySchema, 'query'), shopController_1.listProductsHandler);
exports.shopRouter.get('/products/:slug', (0, validate_1.validate)(shop_1.productSlugParamsSchema, 'params'), shopController_1.getProductHandler);
// ─── Reviews ─────────────────────────────────────────────────────────────────
exports.shopRouter.get('/products/:id/reviews', shopController_1.listReviewsHandler);
// attachCustomerIfPresent: a logged-in customer gets their identity attached so
// the verified-purchase check can use it; guests are rejected in the service.
exports.shopRouter.post('/products/:id/reviews', rateLimiter_1.submitLimiter, customerAuth_1.attachCustomerIfPresent, (0, validate_1.validate)(shop_1.productReviewSchema), shopController_1.createReviewHandler);
// ─── Cart (guest token OR logged-in customer) ────────────────────────────────
exports.shopRouter.get('/cart', customerAuth_1.attachCustomerIfPresent, shopController_1.getCartHandler);
exports.shopRouter.post('/cart/items', rateLimiter_1.submitLimiter, customerAuth_1.attachCustomerIfPresent, (0, validate_1.validate)(shop_1.cartAddSchema), shopController_1.addToCartHandler);
exports.shopRouter.patch('/cart/items/:itemId', (0, validate_1.validate)(shop_1.cartUpdateSchema), shopController_1.updateCartItemHandler);
exports.shopRouter.delete('/cart/items/:itemId', (0, validate_1.validate)(shop_1.cartRemoveSchema), shopController_1.removeCartItemHandler);
exports.shopRouter.post('/cart/clear', (0, validate_1.validate)(shop_1.cartTokenSchema), shopController_1.clearCartHandler);
// ─── Checkout + orders ───────────────────────────────────────────────────────
exports.shopRouter.post('/orders', rateLimiter_1.submitLimiter, customerAuth_1.attachCustomerIfPresent, upload_1.upload.single('receipt'), (0, validate_1.validate)(shop_1.checkoutSchema), shopController_1.createOrderHandler);
exports.shopRouter.get('/orders', (0, validate_1.validate)(shop_1.orderLookupSchema, 'query'), shopController_1.getOrderHandler);
exports.shopRouter.post('/orders/cancel', rateLimiter_1.submitLimiter, (0, validate_1.validate)(shop_1.orderLookupSchema), shopController_1.cancelOrderHandler);
// Payment for an existing order
exports.shopRouter.post('/orders/:reference/receipt', rateLimiter_1.submitLimiter, upload_1.upload.single('receipt'), (0, validate_1.validate)(shop_1.submitOrderReceiptSchema), shopController_1.submitReceiptHandler);
exports.shopRouter.post('/orders/:reference/transfer-reference', rateLimiter_1.submitLimiter, (0, validate_1.validate)(shop_1.submitOrderReceiptSchema), shopController_1.submitTransferReferenceHandler);
exports.shopRouter.post('/orders/:reference/paystack/initialize', (0, validate_1.validate)(shop_1.orderRefParamsSchema, 'params'), shopController_1.initOrderPaystackHandler);
exports.shopRouter.post('/orders/:reference/paystack/verify', (0, validate_1.validate)(shop_1.orderRefParamsSchema, 'params'), (0, validate_1.validate)(shop_1.paystackOrderVerifySchema), shopController_1.verifyOrderPaystackHandler);
// ─── Customer order history (auth required) ──────────────────────────────────
exports.shopRouter.get('/my/orders', customerAuth_1.requireCustomer, shopController_1.listMyOrdersHandler);
//# sourceMappingURL=shop.js.map