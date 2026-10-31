"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketplaceAdminRouter = void 0;
const express_1 = require("express");
const adminMarketplaceController_1 = require("../controllers/adminMarketplaceController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const upload_1 = require("../utils/upload");
const marketplaceAdmin_1 = require("../validators/marketplaceAdmin");
/** Admin marketplace — every route is behind requireAdmin (JWT role ADMIN). */
exports.marketplaceAdminRouter = (0, express_1.Router)();
exports.marketplaceAdminRouter.use(auth_1.requireAdmin);
// Overview
exports.marketplaceAdminRouter.get('/overview', adminMarketplaceController_1.overviewHandler);
// Vendors
exports.marketplaceAdminRouter.get('/vendors', (0, validate_1.validate)(marketplaceAdmin_1.adminVendorListQuerySchema, 'query'), adminMarketplaceController_1.listVendorsHandler);
exports.marketplaceAdminRouter.get('/vendors/:id', (0, validate_1.validate)(marketplaceAdmin_1.adminVendorParamsSchema, 'params'), adminMarketplaceController_1.getVendorHandler);
exports.marketplaceAdminRouter.patch('/vendors/:id/status', (0, validate_1.validate)(marketplaceAdmin_1.adminVendorParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminVendorStatusSchema), adminMarketplaceController_1.updateVendorStatusHandler);
// Products
exports.marketplaceAdminRouter.get('/products', (0, validate_1.validate)(marketplaceAdmin_1.adminProductListQuerySchema, 'query'), adminMarketplaceController_1.listProductsHandler);
exports.marketplaceAdminRouter.post('/products', upload_1.upload.array('images', 8), (0, validate_1.validate)(marketplaceAdmin_1.adminProductSchema), adminMarketplaceController_1.createProductHandler);
exports.marketplaceAdminRouter.put('/products/:id', (0, validate_1.validate)(marketplaceAdmin_1.adminVendorParamsSchema, 'params'), upload_1.upload.array('images', 8), (0, validate_1.validate)(marketplaceAdmin_1.adminProductSchema), adminMarketplaceController_1.updateProductHandler);
exports.marketplaceAdminRouter.patch('/products/:id/availability', (0, validate_1.validate)(marketplaceAdmin_1.adminVendorParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminProductAvailabilitySchema), adminMarketplaceController_1.setProductAvailabilityHandler);
exports.marketplaceAdminRouter.post('/products/:id/moderate', (0, validate_1.validate)(marketplaceAdmin_1.adminVendorParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminProductActionSchema), adminMarketplaceController_1.moderateProductHandler);
exports.marketplaceAdminRouter.delete('/products/:id', (0, validate_1.validate)(marketplaceAdmin_1.adminVendorParamsSchema, 'params'), adminMarketplaceController_1.deleteProductHandler);
// Categories
exports.marketplaceAdminRouter.get('/categories', adminMarketplaceController_1.listCategoriesHandler);
exports.marketplaceAdminRouter.post('/categories', (0, validate_1.validate)(marketplaceAdmin_1.adminCategorySchema), adminMarketplaceController_1.createCategoryHandler);
exports.marketplaceAdminRouter.put('/categories/:id', (0, validate_1.validate)(marketplaceAdmin_1.adminCategoryIdParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminCategorySchema.partial()), adminMarketplaceController_1.updateCategoryHandler);
exports.marketplaceAdminRouter.delete('/categories/:id', (0, validate_1.validate)(marketplaceAdmin_1.adminCategoryIdParamsSchema, 'params'), adminMarketplaceController_1.deleteCategoryHandler);
// Orders + payments
exports.marketplaceAdminRouter.get('/orders', (0, validate_1.validate)(marketplaceAdmin_1.adminOrderListQuerySchema, 'query'), adminMarketplaceController_1.listOrdersHandler);
exports.marketplaceAdminRouter.get('/orders/:reference', (0, validate_1.validate)(marketplaceAdmin_1.adminOrderParamsSchema, 'params'), adminMarketplaceController_1.getOrderHandler);
exports.marketplaceAdminRouter.patch('/orders/:reference/status', (0, validate_1.validate)(marketplaceAdmin_1.adminOrderParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminOrderStatusSchema), adminMarketplaceController_1.updateOrderStatusHandler);
exports.marketplaceAdminRouter.post('/orders/:reference/payment/verify', (0, validate_1.validate)(marketplaceAdmin_1.adminOrderParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminVerifyOrderPaymentSchema), adminMarketplaceController_1.verifyOrderPaymentHandler);
exports.marketplaceAdminRouter.post('/orders/:reference/payment/reject', (0, validate_1.validate)(marketplaceAdmin_1.adminOrderParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminRejectOrderPaymentSchema), adminMarketplaceController_1.rejectOrderPaymentHandler);
// Refunds
exports.marketplaceAdminRouter.post('/orders/:reference/refunds', (0, validate_1.validate)(marketplaceAdmin_1.adminOrderParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminRefundRequestSchema), adminMarketplaceController_1.createRefundHandler);
exports.marketplaceAdminRouter.post('/refunds/:id/resolve', (0, validate_1.validate)(marketplaceAdmin_1.refundIdParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminResolveRefundSchema), adminMarketplaceController_1.resolveRefundHandler);
// Settings
exports.marketplaceAdminRouter.get('/settings', adminMarketplaceController_1.getSettingsHandler);
exports.marketplaceAdminRouter.put('/settings', (0, validate_1.validate)(marketplaceAdmin_1.adminMarketplaceSettingsSchema), adminMarketplaceController_1.updateSettingsHandler);
// Commission ledger + exports
exports.marketplaceAdminRouter.get('/ledger', (0, validate_1.validate)(marketplaceAdmin_1.adminLedgerQuerySchema, 'query'), adminMarketplaceController_1.listLedgerHandler);
exports.marketplaceAdminRouter.get('/reports/orders.csv', adminMarketplaceController_1.exportOrdersHandler);
exports.marketplaceAdminRouter.get('/reports/ledger.csv', adminMarketplaceController_1.exportLedgerHandler);
// Payouts
exports.marketplaceAdminRouter.get('/payouts', (0, validate_1.validate)(marketplaceAdmin_1.adminPayoutListQuerySchema, 'query'), adminMarketplaceController_1.listPayoutsHandler);
exports.marketplaceAdminRouter.post('/payouts/:id/process', (0, validate_1.validate)(marketplaceAdmin_1.payoutIdParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminPayoutActionSchema), adminMarketplaceController_1.processPayoutHandler);
// Product reviews moderation
exports.marketplaceAdminRouter.get('/reviews', (0, validate_1.validate)(marketplaceAdmin_1.adminReviewListQuerySchema, 'query'), adminMarketplaceController_1.listReviewsHandler);
exports.marketplaceAdminRouter.post('/reviews/:id/moderate', (0, validate_1.validate)(marketplaceAdmin_1.refundIdParamsSchema, 'params'), (0, validate_1.validate)(marketplaceAdmin_1.adminReviewActionSchema), adminMarketplaceController_1.moderateReviewHandler);
//# sourceMappingURL=marketplaceAdmin.js.map