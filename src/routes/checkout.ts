import { Router } from 'express'
import {
  abandonCheckoutHandler,
  createCheckoutHandler,
  finalizeCheckoutHandler,
  getCheckoutHandler,
  initializeCheckoutPaystackHandler,
  verifyCheckoutPaystackHandler,
} from '../controllers/checkoutController'
import { validate } from '../middleware/validate'
import { submitLimiter } from '../middleware/rateLimiter'
import { upload } from '../utils/upload'
import {
  checkoutVerifySchema,
  createCheckoutSchema,
  sessionTokenParamsSchema,
} from '../validators/checkout'

export const checkoutRouter = Router()

/**
 * @swagger
 * /api/checkout:
 *   post:
 *     tags: [Checkout]
 *     summary: Create a temporary booking session (public)
 *     description: |
 *       Stages the booking for payment. Creates NO appointment and NO payment
 *       record — only a temporary session. Requires paymentMethod; transfer
 *       methods must attach the receipt (multipart field "receipt").
 *       The appointment is only created when the payment condition is met:
 *       cash/transfer via POST /:sessionToken/finalize, online via the
 *       Paystack-verified callback.
 */
checkoutRouter.post(
  '/',
  submitLimiter,
  upload.single('receipt'),
  validate(createCheckoutSchema),
  createCheckoutHandler,
)

/**
 * @swagger
 * /api/checkout/{sessionToken}:
 *   get:
 *     tags: [Checkout]
 *     summary: Get a booking session (public)
 */
checkoutRouter.get(
  '/:sessionToken',
  validate(sessionTokenParamsSchema, 'params'),
  getCheckoutHandler,
)

/**
 * @swagger
 * /api/checkout/{sessionToken}/paystack/initialize:
 *   post:
 *     tags: [Checkout]
 *     summary: Start Paystack checkout for this session (public)
 *     description: Creates the Paystack transaction on the SESSION — no appointment exists yet.
 */
checkoutRouter.post(
  '/:sessionToken/paystack/initialize',
  validate(sessionTokenParamsSchema, 'params'),
  initializeCheckoutPaystackHandler,
)

/**
 * @swagger
 * /api/checkout/{sessionToken}/paystack/verify:
 *   post:
 *     tags: [Checkout]
 *     summary: Verify the Paystack charge server-side (public)
 *     description: Only after Paystack itself confirms success does this create the Appointment + Payment, atomically.
 */
checkoutRouter.post(
  '/:sessionToken/paystack/verify',
  validate(sessionTokenParamsSchema, 'params'),
  validate(checkoutVerifySchema),
  verifyCheckoutPaystackHandler,
)

/**
 * @swagger
 * /api/checkout/{sessionToken}/finalize:
 *   post:
 *     tags: [Checkout]
 *     summary: Complete the booking (public)
 *     description: Converts the session into a real Appointment + Payment atomically. Valid for CASH and receipt-backed transfer methods (the payment condition is already satisfied at session creation).
 */
checkoutRouter.post(
  '/:sessionToken/finalize',
  submitLimiter,
  validate(sessionTokenParamsSchema, 'params'),
  finalizeCheckoutHandler,
)

/**
 * @swagger
 * /api/checkout/{sessionToken}/abandon:
 *   post:
 *     tags: [Checkout]
 *     summary: Abandon the booking (public)
 *     description: Marks the session EXPIRED. Nothing was ever written to appointments/payments — the booking is simply gone.
 */
checkoutRouter.post(
  '/:sessionToken/abandon',
  validate(sessionTokenParamsSchema, 'params'),
  abandonCheckoutHandler,
)
