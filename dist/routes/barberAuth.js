"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.barberAuthRouter = void 0;
const express_1 = require("express");
const barberAuth_1 = require("../middleware/barberAuth");
const barberAuthController_1 = require("../controllers/barberAuthController");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const barberAuth_2 = require("../validators/barberAuth");
const auth_1 = require("../validators/auth");
/** Barber Portal authentication — separate namespace from /admin so tokens never cross. */
exports.barberAuthRouter = (0, express_1.Router)();
exports.barberAuthRouter.post('/login', rateLimiter_1.barberAuthLimiter, (0, validate_1.validate)(barberAuth_2.barberLoginSchema), barberAuthController_1.loginBarberController);
/**
 * Forgot Password (public). The endpoints force target=BARBER server-side:
 * a client can never redirect admin/customer codes through the barber routes.
 */
exports.barberAuthRouter.post('/forgot-password/request', rateLimiter_1.passwordResetLimiter, (0, validate_1.validate)(auth_1.forgotPasswordRequestSchema), barberAuthController_1.requestBarberPasswordResetController);
exports.barberAuthRouter.post('/forgot-password/verify', rateLimiter_1.passwordResetLimiter, (0, validate_1.validate)(auth_1.forgotPasswordVerifySchema), barberAuthController_1.verifyBarberPasswordResetController);
exports.barberAuthRouter.post('/forgot-password/reset', rateLimiter_1.passwordResetLimiter, (0, validate_1.validate)(auth_1.forgotPasswordResetSchema), barberAuthController_1.resetBarberPasswordController);
exports.barberAuthRouter.use(barberAuth_1.requireBarber);
exports.barberAuthRouter.get('/me', barberAuthController_1.getBarberMeController);
exports.barberAuthRouter.post('/change-password', (0, validate_1.validate)(barberAuth_2.barberChangePasswordSchema), barberAuthController_1.changeBarberPasswordController);
//# sourceMappingURL=barberAuth.js.map