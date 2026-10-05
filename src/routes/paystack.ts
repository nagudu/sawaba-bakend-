import { Router } from 'express'
import {
  initializePaystackHandler,
  verifyPaystackHandler,
  paystackWebhookHandler,
} from '../controllers/paystackController'
import { validate } from '../middleware/validate'
import { paymentTokenParamsSchema, paystackVerifySchema } from '../validators/payment'

export const paystackRouter = Router()

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
paystackRouter.post(
  '/initialize/:token',
  validate(paymentTokenParamsSchema, 'params'),
  initializePaystackHandler,
)

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
paystackRouter.post(
  '/verify/:token',
  validate(paymentTokenParamsSchema, 'params'),
  validate(paystackVerifySchema),
  verifyPaystackHandler,
)

/**
 * @swagger
 * /api/payments/paystack/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Paystack webhook (called by Paystack)
 *     description: Validates the x-paystack-signature HMAC over the raw body, then applies charge.success.
 */
paystackRouter.post('/webhook', paystackWebhookHandler)
