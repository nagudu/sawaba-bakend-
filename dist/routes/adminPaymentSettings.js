"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminPaymentSettingsRouter = void 0;
const express_1 = require("express");
const paymentSettingsController_1 = require("../controllers/paymentSettingsController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const paymentSettings_1 = require("../validators/paymentSettings");
exports.adminPaymentSettingsRouter = (0, express_1.Router)();
exports.adminPaymentSettingsRouter.use(auth_1.requireAdmin);
/**
 * @swagger
 * /api/admin/payment-settings:
 *   get:
 *     tags: [PaymentSettings]
 *     summary: Get payment settings (admin)
 *     security:
 *       - bearerAuth: []
 */
exports.adminPaymentSettingsRouter.get('/', paymentSettingsController_1.getPaymentSettingsAdminHandler);
/**
 * @swagger
 * /api/admin/payment-settings:
 *   put:
 *     tags: [PaymentSettings]
 *     summary: Update payment settings (admin)
 *     security:
 *       - bearerAuth: []
 */
exports.adminPaymentSettingsRouter.put('/', (0, validate_1.validate)(paymentSettings_1.updatePaymentSettingsSchema), paymentSettingsController_1.updatePaymentSettingsHandler);
//# sourceMappingURL=adminPaymentSettings.js.map