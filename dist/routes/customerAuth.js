"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerAuthRouter = void 0;
const express_1 = require("express");
const customerAuthController_1 = require("../controllers/customerAuthController");
const customerAuth_1 = require("../middleware/customerAuth");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const customerAuth_2 = require("../validators/customerAuth");
exports.customerAuthRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/account/otp/request:
 *   post:
 *     tags: [Account]
 *     summary: Request a login OTP (public)
 *     description: Sends a 6-digit code to the customer's saved email. Only existing accounts receive codes.
 */
exports.customerAuthRouter.post('/otp/request', rateLimiter_1.otpLimiter, (0, validate_1.validate)(customerAuth_2.customerOtpRequestSchema), customerAuthController_1.requestOtpHandler);
/**
 * @swagger
 * /api/account/otp/verify:
 *   post:
 *     tags: [Account]
 *     summary: Verify OTP and login (public)
 */
exports.customerAuthRouter.post('/otp/verify', rateLimiter_1.otpLimiter, (0, validate_1.validate)(customerAuth_2.customerOtpVerifySchema), customerAuthController_1.verifyOtpHandler);
/**
 * @swagger
 * /api/account/register:
 *   post:
 *     tags: [Account]
 *     summary: Create a customer account (public)
 *     description: One account per phone number; legacy guest records are upgraded, never duplicated.
 */
exports.customerAuthRouter.post('/register', rateLimiter_1.customerAuthLimiter, (0, validate_1.validate)(customerAuth_2.customerRegisterSchema), customerAuthController_1.registerHandler);
/**
 * @swagger
 * /api/account/login:
 *   post:
 *     tags: [Account]
 *     summary: Login with phone + password (public)
 */
exports.customerAuthRouter.post('/login', rateLimiter_1.customerAuthLimiter, (0, validate_1.validate)(customerAuth_2.customerLoginPasswordSchema), customerAuthController_1.loginPasswordHandler);
/**
 * @swagger
 * /api/account/google:
 *   post:
 *     tags: [Account]
 *     summary: Sign in or sign up with Google (public)
 *     description: >
 *       Accepts a Google Identity Services ID token ("credential"). The token is
 *       verified server-side against Google's certificates and audience, then
 *       the customer is matched by Google account id (sub), or linked by a
 *       Google-verified email, or created. Never returns a duplicate account.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential: { type: string, description: Google ID token (JWT) }
 *     responses:
 *       200: { description: Signed in (existing or linked account) }
 *       201: { description: Account created }
 *       401: { description: Credential could not be verified }
 *       422: { description: Google sign-in not configured }
 */
exports.customerAuthRouter.post('/google', rateLimiter_1.customerAuthLimiter, (0, validate_1.validate)(customerAuth_2.customerGoogleAuthSchema), customerAuthController_1.googleAuthHandler);
exports.customerAuthRouter.get('/me', customerAuth_1.requireCustomer, customerAuthController_1.meHandler);
exports.customerAuthRouter.patch('/me', customerAuth_1.requireCustomer, (0, validate_1.validate)(customerAuth_2.customerProfileUpdateSchema), customerAuthController_1.updateProfileHandler);
exports.customerAuthRouter.post('/me/password', customerAuth_1.requireCustomer, (0, validate_1.validate)(customerAuth_2.customerPasswordChangeSchema), customerAuthController_1.changePasswordHandler);
exports.customerAuthRouter.get('/booking-prefill', customerAuth_1.requireCustomer, customerAuthController_1.prefillHandler);
//# sourceMappingURL=customerAuth.js.map