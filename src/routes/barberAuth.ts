import { Router } from 'express'
import { requireBarber } from '../middleware/barberAuth'
import {
  changeBarberPasswordController,
  getBarberMeController,
  loginBarberController,
  requestBarberPasswordResetController,
  verifyBarberPasswordResetController,
  resetBarberPasswordController,
} from '../controllers/barberAuthController'
import { validate } from '../middleware/validate'
import { barberAuthLimiter, passwordResetLimiter } from '../middleware/rateLimiter'
import { barberChangePasswordSchema, barberLoginSchema } from '../validators/barberAuth'
import {
  forgotPasswordRequestSchema,
  forgotPasswordVerifySchema,
  forgotPasswordResetSchema,
} from '../validators/auth'

/** Barber Portal authentication — separate namespace from /admin so tokens never cross. */
export const barberAuthRouter = Router()

barberAuthRouter.post('/login', barberAuthLimiter, validate(barberLoginSchema), loginBarberController)

/**
 * Forgot Password (public). The endpoints force target=BARBER server-side:
 * a client can never redirect admin/customer codes through the barber routes.
 */
barberAuthRouter.post(
  '/forgot-password/request',
  passwordResetLimiter,
  validate(forgotPasswordRequestSchema),
  requestBarberPasswordResetController,
)
barberAuthRouter.post(
  '/forgot-password/verify',
  passwordResetLimiter,
  validate(forgotPasswordVerifySchema),
  verifyBarberPasswordResetController,
)
barberAuthRouter.post(
  '/forgot-password/reset',
  passwordResetLimiter,
  validate(forgotPasswordResetSchema),
  resetBarberPasswordController,
)

barberAuthRouter.use(requireBarber)
barberAuthRouter.get('/me', getBarberMeController)
barberAuthRouter.post('/change-password', validate(barberChangePasswordSchema), changeBarberPasswordController)