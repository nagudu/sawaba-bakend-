"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const auth_2 = require("../validators/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const upload_1 = require("../utils/upload");
exports.authRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Admin login
 */
exports.authRouter.post('/login', rateLimiter_1.authLimiter, (0, validate_1.validate)(auth_2.loginSchema), authController_1.loginHandler);
/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get authenticated admin profile
 */
exports.authRouter.get('/me', auth_1.requireAdmin, authController_1.meHandler);
/**
 * @swagger
 * /api/auth/profile:
 *   patch:
 *     tags: [Auth]
 *     summary: Update admin profile (name, email, avatar photo)
 */
exports.authRouter.patch('/profile', auth_1.requireAdmin, upload_1.upload.single('avatar'), (0, validate_1.validate)(auth_2.updateAdminProfileSchema), authController_1.updateProfileHandler);
/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change admin password
 */
exports.authRouter.post('/change-password', auth_1.requireAdmin, (0, validate_1.validate)(auth_2.changePasswordSchema), authController_1.changePasswordHandler);
/**
 * @swagger
 * /api/auth/forgot-password/request:
 *   post:
 *     tags: [Auth]
 *     summary: Request a 6-digit password reset code (email or SMS)
 */
exports.authRouter.post('/forgot-password/request', rateLimiter_1.passwordResetLimiter, (0, validate_1.validate)(auth_2.forgotPasswordRequestSchema), authController_1.requestPasswordResetHandler);
/**
 * @swagger
 * /api/auth/forgot-password/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify 6-digit password reset code (returns a one-time reset token)
 */
exports.authRouter.post('/forgot-password/verify', rateLimiter_1.passwordResetLimiter, (0, validate_1.validate)(auth_2.forgotPasswordVerifySchema), authController_1.verifyPasswordResetHandler);
/**
 * @swagger
 * /api/auth/forgot-password/reset:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with the reset token from /verify
 */
exports.authRouter.post('/forgot-password/reset', rateLimiter_1.passwordResetLimiter, (0, validate_1.validate)(auth_2.forgotPasswordResetSchema), authController_1.resetPasswordHandler);
//# sourceMappingURL=auth.js.map