"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vendorPortalRouter = void 0;
const express_1 = require("express");
const vendorController_1 = require("../controllers/vendorController");
const vendorAuth_1 = require("../middleware/vendorAuth");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const upload_1 = require("../utils/upload");
const shop_1 = require("../validators/shop");
exports.vendorPortalRouter = (0, express_1.Router)();
// ─── Public auth ─────────────────────────────────────────────────────────────
exports.vendorPortalRouter.post('/register', rateLimiter_1.customerAuthLimiter, (0, validate_1.validate)(shop_1.vendorRegisterSchema), vendorController_1.vendorRegisterHandler);
exports.vendorPortalRouter.post('/login', rateLimiter_1.customerAuthLimiter, (0, validate_1.validate)(shop_1.vendorLoginSchema), vendorController_1.vendorLoginHandler);
// Everything below requires a valid VENDOR token.
exports.vendorPortalRouter.use(vendorAuth_1.requireVendor);
exports.vendorPortalRouter.get('/me', vendorController_1.vendorMeHandler);
exports.vendorPortalRouter.patch('/me', (0, validate_1.validate)(shop_1.vendorProfileUpdateSchema), vendorController_1.vendorUpdateProfileHandler);
exports.vendorPortalRouter.post('/change-password', (0, validate_1.validate)(shop_1.vendorChangePasswordSchema), vendorController_1.vendorChangePasswordHandler);
// Dashboard
exports.vendorPortalRouter.get('/dashboard', vendorController_1.vendorDashboardHandler);
exports.vendorPortalRouter.get('/notifications', vendorController_1.vendorNotificationsHandler);
exports.vendorPortalRouter.post('/notifications/:id/read', vendorController_1.vendorReadNotificationHandler);
// Products
exports.vendorPortalRouter.get('/products', vendorController_1.vendorListProductsHandler);
exports.vendorPortalRouter.post('/products', rateLimiter_1.submitLimiter, upload_1.upload.array('images', 8), vendorController_1.vendorCreateProductHandler);
exports.vendorPortalRouter.put('/products/:id', upload_1.upload.array('images', 8), (0, validate_1.validate)(shop_1.vendorProductIdParamsSchema, 'params'), vendorController_1.vendorUpdateProductHandler);
exports.vendorPortalRouter.patch('/products/:id/active', (0, validate_1.validate)(shop_1.vendorProductIdParamsSchema, 'params'), vendorController_1.vendorToggleProductHandler);
exports.vendorPortalRouter.delete('/products/:id', (0, validate_1.validate)(shop_1.vendorProductIdParamsSchema, 'params'), vendorController_1.vendorDeleteProductHandler);
// Orders (vendor's slice of multi-vendor orders)
exports.vendorPortalRouter.get('/orders', vendorController_1.vendorListOrdersHandler);
exports.vendorPortalRouter.patch('/orders/items/:itemId', (0, validate_1.validate)(shop_1.vendorItemParamsSchema, 'params'), (0, validate_1.validate)(shop_1.vendorItemUpdateSchema), vendorController_1.vendorUpdateOrderItemHandler);
// Earnings + payouts
exports.vendorPortalRouter.get('/earnings', vendorController_1.vendorEarningsHandler);
exports.vendorPortalRouter.post('/payouts', (0, validate_1.validate)(shop_1.vendorPayoutRequestSchema), vendorController_1.vendorRequestPayoutHandler);
//# sourceMappingURL=vendorPortal.js.map