import { Router } from 'express'
import { loginHandler, meHandler, changePasswordHandler } from '../controllers/authController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { loginSchema, changePasswordSchema } from '../validators/auth'
import { authLimiter } from '../middleware/rateLimiter'

export const authRouter = Router()

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Admin login
 *     description: Returns a JWT access token and admin information.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful.
 *       401:
 *         description: Invalid credentials.
 *       429:
 *         description: Too many login attempts.
 */
authRouter.post('/login', authLimiter, validate(loginSchema), loginHandler)

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get authenticated admin profile
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Admin profile.
 *       401:
 *         description: Unauthorized.
 */
authRouter.get('/me', requireAdmin, meHandler)

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change admin password
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200:
 *         description: Password updated.
 */
authRouter.post('/change-password', requireAdmin, validate(changePasswordSchema), changePasswordHandler)