import { Router } from 'express'
import {
  loginHandler,
  meHandler,
  changePasswordHandler,
  updateProfileHandler,
  requestPasswordResetHandler,
  verifyPasswordResetHandler,
  resetPasswordHandler,
} from '../controllers/authController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import {
  loginSchema,
  changePasswordSchema,
  forgotPasswordRequestSchema,
  forgotPasswordVerifySchema,
  forgotPasswordResetSchema,
  updateAdminProfileSchema,
} from '../validators/auth'
import { authLimiter } from '../middleware/rateLimiter'
import { upload } from '../utils/upload'

export const authRouter = Router()

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Admin login
 */
authRouter.post('/login', authLimiter, validate(loginSchema), loginHandler)

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get authenticated admin profile
 */
authRouter.get('/me', requireAdmin, meHandler)

/**
 * @swagger
 * /api/auth/profile:
 *   patch:
 *     tags: [Auth]
 *     summary: Update admin profile (name, email, avatar photo)
 */
authRouter.patch(
  '/profile',
  requireAdmin,
  upload.single('avatar'),
  validate(updateAdminProfileSchema),
  updateProfileHandler,
)

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change admin password
 */
authRouter.post('/change-password', requireAdmin, validate(changePasswordSchema), changePasswordHandler)

/**
 * @swagger
 * /api/auth/forgot-password/request:
 *   post:
 *     tags: [Auth]
 *     summary: Request a 6-digit password reset code sent to email
 */
authRouter.post(
  '/forgot-password/request',
  authLimiter,
  validate(forgotPasswordRequestSchema),
  requestPasswordResetHandler,
)

/**
 * @swagger
 * /api/auth/forgot-password/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify 6-digit password reset code
 */
authRouter.post(
  '/forgot-password/verify',
  authLimiter,
  validate(forgotPasswordVerifySchema),
  verifyPasswordResetHandler,
)

/**
 * @swagger
 * /api/auth/forgot-password/reset:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using verified code
 */
authRouter.post(
  '/forgot-password/reset',
  authLimiter,
  validate(forgotPasswordResetSchema),
  resetPasswordHandler,
)