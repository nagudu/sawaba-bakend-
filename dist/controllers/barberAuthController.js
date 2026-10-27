"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginBarberController = loginBarberController;
exports.getBarberMeController = getBarberMeController;
exports.changeBarberPasswordController = changeBarberPasswordController;
exports.requestBarberPasswordResetController = requestBarberPasswordResetController;
exports.verifyBarberPasswordResetController = verifyBarberPasswordResetController;
exports.resetBarberPasswordController = resetBarberPasswordController;
const barberAuthService_1 = require("../services/barberAuthService");
const authService_1 = require("../services/authService");
const response_1 = require("../utils/response");
/** Errors must reach the central error middleware via next() — throwing in an
 *  async handler crashes the process instead of returning a 4xx. */
async function loginBarberController(req, res, next) {
    try {
        const session = await (0, barberAuthService_1.loginBarber)(req.body);
        (0, response_1.successRes)(res, 'Login successful.', session, 200);
    }
    catch (error) {
        next(error);
    }
}
async function getBarberMeController(req, res, next) {
    try {
        const barber = await (0, barberAuthService_1.getBarberMe)(req.barber.id);
        (0, response_1.successRes)(res, 'Barber profile fetched.', { barber }, 200);
    }
    catch (error) {
        next(error);
    }
}
async function changeBarberPasswordController(req, res, next) {
    try {
        await (0, barberAuthService_1.changeBarberPassword)(req.barber.id, req.body);
        (0, response_1.successRes)(res, 'Password updated.', undefined, 200);
    }
    catch (error) {
        next(error);
    }
}
async function requestBarberPasswordResetController(req, res, next) {
    try {
        const { email } = req.body;
        const result = await (0, authService_1.requestPasswordReset)(email, 'BARBER');
        (0, response_1.successRes)(res, result.message, {}, 200);
    }
    catch (error) {
        next(error);
    }
}
async function verifyBarberPasswordResetController(req, res, next) {
    try {
        const { email, code } = req.body;
        const result = await (0, authService_1.verifyPasswordResetOtp)(email, code, 'BARBER');
        (0, response_1.successRes)(res, 'Verification code confirmed.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function resetBarberPasswordController(req, res, next) {
    try {
        const { email, resetToken, newPassword } = req.body;
        await (0, authService_1.resetPasswordWithOtp)(email, resetToken, newPassword, 'BARBER');
        (0, response_1.successRes)(res, 'Password has been reset successfully. You can now sign in with your new password.', {}, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=barberAuthController.js.map