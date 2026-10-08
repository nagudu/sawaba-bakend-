import { Router } from 'express'
import {
  changePasswordHandler,
  googleAuthHandler,
  loginPasswordHandler,
  meHandler,
  prefillHandler,
  registerHandler,
  requestOtpHandler,
  updateProfileHandler,
  verifyOtpHandler,
} from '../controllers/customerAuthController'
import { requireCustomer } from '../middleware/customerAuth'
import { validate } from '../middleware/validate'
import { customerAuthLimiter, otpLimiter } from '../middleware/rateLimiter'
import {
  customerGoogleAuthSchema,
  customerLoginPasswordSchema,
  customerOtpRequestSchema,
  customerOtpVerifySchema,
  customerPasswordChangeSchema,
  customerProfileUpdateSchema,
  customerRegisterSchema,
} from '../validators/customerAuth'

export const customerAuthRouter = Router()

/**
 * @swagger
 * /api/account/otp/request:
 *   post:
 *     tags: [Account]
 *     summary: Request a login OTP (public)
 *     description: Sends a 6-digit code by SMS (when configured) or to the customer's saved email. Only existing accounts receive codes.
 */
customerAuthRouter.post('/otp/request', otpLimiter, validate(customerOtpRequestSchema), requestOtpHandler)

/**
 * @swagger
 * /api/account/otp/verify:
 *   post:
 *     tags: [Account]
 *     summary: Verify OTP and login (public)
 */
customerAuthRouter.post('/otp/verify', otpLimiter, validate(customerOtpVerifySchema), verifyOtpHandler)

/**
 * @swagger
 * /api/account/register:
 *   post:
 *     tags: [Account]
 *     summary: Create a customer account (public)
 *     description: One account per phone number; legacy guest records are upgraded, never duplicated.
 */
customerAuthRouter.post('/register', customerAuthLimiter, validate(customerRegisterSchema), registerHandler)

/**
 * @swagger
 * /api/account/login:
 *   post:
 *     tags: [Account]
 *     summary: Login with phone + password (public)
 */
customerAuthRouter.post('/login', customerAuthLimiter, validate(customerLoginPasswordSchema), loginPasswordHandler)

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
customerAuthRouter.post('/google', customerAuthLimiter, validate(customerGoogleAuthSchema), googleAuthHandler)

customerAuthRouter.get('/me', requireCustomer, meHandler)
customerAuthRouter.patch('/me', requireCustomer, validate(customerProfileUpdateSchema), updateProfileHandler)
customerAuthRouter.post(
  '/me/password',
  requireCustomer,
  validate(customerPasswordChangeSchema),
  changePasswordHandler,
)
customerAuthRouter.get('/booking-prefill', requireCustomer, prefillHandler)
