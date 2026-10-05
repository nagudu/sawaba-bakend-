import { Router } from 'express'
import {
  declareCashHandler,
  getPaymentSettingsHandler,
  getPublicPaymentHandler,
  submitPaymentHandler,
  trackPaymentHandler,
} from '../controllers/paymentController'
import { validate } from '../middleware/validate'
import { submitLimiter } from '../middleware/rateLimiter'
import { upload } from '../utils/upload'
import {
  paymentTokenParamsSchema,
  submitPaymentSchema,
  trackPaymentSchema,
} from '../validators/payment'

export const paymentsRouter = Router()

/**
 * @swagger
 * /api/payments/settings:
 *   get:
 *     tags: [Payments]
 *     summary: Get public payment account details (public)
 *     description: Returns the salon bank / OPay details, instructions and rules customers need to pay.
 */
paymentsRouter.get('/settings', getPaymentSettingsHandler)

/**
 * @swagger
 * /api/payments/track:
 *   post:
 *     tags: [Payments]
 *     summary: Locate a payment using the appointment id and phone number (public)
 */
paymentsRouter.post(
  '/track',
  submitLimiter,
  validate(trackPaymentSchema),
  trackPaymentHandler,
)

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
paymentsRouter.get('/:token', validate(paymentTokenParamsSchema, 'params'), getPublicPaymentHandler)

/**
 * @swagger
 * /api/payments/{token}/cash:
 *   post:
 *     tags: [Payments]
 *     summary: Declare cash-at-salon as the payment method (public)
 *     description: Records the method and keeps the payment UNPAID — an admin confirms receipt of the cash in person.
 */
paymentsRouter.post(
  '/:token/cash',
  submitLimiter,
  validate(paymentTokenParamsSchema, 'params'),
  declareCashHandler,
)

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
paymentsRouter.post(
  '/:token/submit',
  upload.single('receipt'),
  validate(submitPaymentSchema),
  submitPaymentHandler,
)