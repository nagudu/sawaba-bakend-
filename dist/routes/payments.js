"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentsRouter = void 0;
const express_1 = require("express");
const paymentController_1 = require("../controllers/paymentController");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const upload_1 = require("../utils/upload");
const payment_1 = require("../validators/payment");
exports.paymentsRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/payments/settings:
 *   get:
 *     tags: [Payments]
 *     summary: Get public payment account details (public)
 *     description: Returns the salon bank / OPay details, instructions and rules customers need to pay.
 */
exports.paymentsRouter.get('/settings', paymentController_1.getPaymentSettingsHandler);
/**
 * @swagger
 * /api/payments/track:
 *   post:
 *     tags: [Payments]
 *     summary: Locate a payment using the appointment id and phone number (public)
 */
exports.paymentsRouter.post('/track', rateLimiter_1.submitLimiter, (0, validate_1.validate)(payment_1.trackPaymentSchema), paymentController_1.trackPaymentHandler);
/**
 * @swagger
 * /api/payments/{token}:
 *   get:
 *     tags: [Payments]
 *     summary: Get a payment by access token (public)
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 */
exports.paymentsRouter.get('/:token', (0, validate_1.validate)(payment_1.paymentTokenParamsSchema, 'params'), paymentController_1.getPublicPaymentHandler);
/**
 * @swagger
 * /api/payments/{token}/cash:
 *   post:
 *     tags: [Payments]
 *     summary: Declare cash-at-salon as the payment method (public)
 *     description: Records the method and keeps the payment UNPAID — an admin confirms receipt of the cash in person.
 */
exports.paymentsRouter.post('/:token/cash', rateLimiter_1.submitLimiter, (0, validate_1.validate)(payment_1.paymentTokenParamsSchema, 'params'), paymentController_1.declareCashHandler);
/**
 * @swagger
 * /api/payments/{token}/submit:
 *   post:
 *     tags: [Payments]
 *     summary: Submit payment with an uploaded receipt (public)
 *     description: Multipart form-data with a "receipt" image file plus paymentMethod, amountPaid, transactionReference, paymentDate and optional note.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 */
exports.paymentsRouter.post('/:token/submit', upload_1.upload.single('receipt'), (0, validate_1.validate)(payment_1.submitPaymentSchema), paymentController_1.submitPaymentHandler);
//# sourceMappingURL=payments.js.map