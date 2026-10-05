"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const auth_2 = require("../validators/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
exports.authRouter = (0, express_1.Router)();
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
exports.authRouter.post('/login', rateLimiter_1.authLimiter, (0, validate_1.validate)(auth_2.loginSchema), authController_1.loginHandler);
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
exports.authRouter.get('/me', auth_1.requireAdmin, authController_1.meHandler);
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
exports.authRouter.post('/change-password', auth_1.requireAdmin, (0, validate_1.validate)(auth_2.changePasswordSchema), authController_1.changePasswordHandler);
//# sourceMappingURL=auth.js.map