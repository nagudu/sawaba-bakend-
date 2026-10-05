"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paystackRouter = void 0;
const express_1 = require("express");
const paystackController_1 = require("../controllers/paystackController");
const validate_1 = require("../middleware/validate");
const payment_1 = require("../validators/payment");
exports.paystackRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/payments/paystack/initialize/{token}:
 *   post:
 *     tags: [Payments]
 *     summary: Start a Paystack online payment (public)
 *     description: Creates a Paystack transaction for the appointment's stored amount and returns the checkout URL.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Checkout URL + reference.
 */
exports.paystackRouter.post('/initialize/:token', (0, validate_1.validate)(payment_1.paymentTokenParamsSchema, 'params'), paystackController_1.initializePaystackHandler);
/**
 * @swagger
 * /api/payments/paystack/verify/{token}:
 *   post:
 *     tags: [Payments]
 *     summary: Verify a Paystack transaction server-side (public)
 *     description: Re-checks the transaction directly with Paystack before marking the payment verified. Never trusts the browser callback alone.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reference]
 *             properties:
 *               reference:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified / current status.
 */
exports.paystackRouter.post('/verify/:token', (0, validate_1.validate)(payment_1.paymentTokenParamsSchema, 'params'), (0, validate_1.validate)(payment_1.paystackVerifySchema), paystackController_1.verifyPaystackHandler);
/**
 * @swagger
 * /api/payments/paystack/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Paystack webhook (called by Paystack)
 *     description: Validates the x-paystack-signature HMAC over the raw body, then applies charge.success.
 */
exports.paystackRouter.post('/webhook', paystackController_1.paystackWebhookHandler);
//# sourceMappingURL=paystack.js.map