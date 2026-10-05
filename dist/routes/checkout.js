"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkoutRouter = void 0;
const express_1 = require("express");
const checkoutController_1 = require("../controllers/checkoutController");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const upload_1 = require("../utils/upload");
const checkout_1 = require("../validators/checkout");
exports.checkoutRouter = (0, express_1.Router)();
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
exports.checkoutRouter.post('/', rateLimiter_1.submitLimiter, upload_1.upload.single('receipt'), (0, validate_1.validate)(checkout_1.createCheckoutSchema), checkoutController_1.createCheckoutHandler);
/**
 * @swagger
 * /api/checkout/{sessionToken}:
 *   get:
 *     tags: [Checkout]
 *     summary: Get a booking session (public)
 */
exports.checkoutRouter.get('/:sessionToken', (0, validate_1.validate)(checkout_1.sessionTokenParamsSchema, 'params'), checkoutController_1.getCheckoutHandler);
/**
 * @swagger
 * /api/checkout/{sessionToken}/paystack/initialize:
 *   post:
 *     tags: [Checkout]
 *     summary: Start Paystack checkout for this session (public)
 *     description: Creates the Paystack transaction on the SESSION — no appointment exists yet.
 */
exports.checkoutRouter.post('/:sessionToken/paystack/initialize', (0, validate_1.validate)(checkout_1.sessionTokenParamsSchema, 'params'), checkoutController_1.initializeCheckoutPaystackHandler);
/**
 * @swagger
 * /api/checkout/{sessionToken}/paystack/verify:
 *   post:
 *     tags: [Checkout]
 *     summary: Verify the Paystack charge server-side (public)
 *     description: Only after Paystack itself confirms success does this create the Appointment + Payment, atomically.
 */
exports.checkoutRouter.post('/:sessionToken/paystack/verify', (0, validate_1.validate)(checkout_1.sessionTokenParamsSchema, 'params'), (0, validate_1.validate)(checkout_1.checkoutVerifySchema), checkoutController_1.verifyCheckoutPaystackHandler);
/**
 * @swagger
 * /api/checkout/{sessionToken}/finalize:
 *   post:
 *     tags: [Checkout]
 *     summary: Complete the booking (public)
 *     description: Converts the session into a real Appointment + Payment atomically. Valid for CASH and receipt-backed transfer methods (the payment condition is already satisfied at session creation).
 */
exports.checkoutRouter.post('/:sessionToken/finalize', rateLimiter_1.submitLimiter, (0, validate_1.validate)(checkout_1.sessionTokenParamsSchema, 'params'), checkoutController_1.finalizeCheckoutHandler);
/**
 * @swagger
 * /api/checkout/{sessionToken}/abandon:
 *   post:
 *     tags: [Checkout]
 *     summary: Abandon the booking (public)
 *     description: Marks the session EXPIRED. Nothing was ever written to appointments/payments — the booking is simply gone.
 */
exports.checkoutRouter.post('/:sessionToken/abandon', (0, validate_1.validate)(checkout_1.sessionTokenParamsSchema, 'params'), checkoutController_1.abandonCheckoutHandler);
//# sourceMappingURL=checkout.js.map