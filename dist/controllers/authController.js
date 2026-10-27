"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginHandler = loginHandler;
exports.meHandler = meHandler;
exports.updateProfileHandler = updateProfileHandler;
exports.changePasswordHandler = changePasswordHandler;
exports.requestPasswordResetHandler = requestPasswordResetHandler;
exports.verifyPasswordResetHandler = verifyPasswordResetHandler;
exports.resetPasswordHandler = resetPasswordHandler;
const authService_1 = require("../services/authService");
const response_1 = require("../utils/response");
const upload_1 = require("../utils/upload");
async function loginHandler(req, res, next) {
    try {
        const input = req.body;
        const result = await (0, authService_1.loginAdmin)(input);
        (0, response_1.successRes)(res, 'Login successful.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function meHandler(req, res, next) {
    try {
        const admin = await (0, authService_1.getMe)(req.admin.id);
        (0, response_1.successRes)(res, 'Admin profile retrieved.', { admin }, 200);
    }
    catch (error) {
        next(error);
    }
}
async function updateProfileHandler(req, res, next) {
    try {
        let avatarUrl = req.body.avatarUrl;
        if (req.file) {
            const current = await (0, authService_1.getMe)(req.admin.id);
            const uploaded = await (0, upload_1.uploadImageToCloudinary)(req.file.buffer, 'sawaba-admins', req.file.mimetype);
            avatarUrl = uploaded.url;
            if (current.avatarUrl && current.avatarUrl !== avatarUrl) {
                await (0, upload_1.deleteImageByUrl)(current.avatarUrl).catch(() => undefined);
            }
        }
        const input = {
            ...(req.body.name ? { name: String(req.body.name).trim() } : {}),
            ...(req.body.email ? { email: String(req.body.email).trim().toLowerCase() } : {}),
            ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        };
        const admin = await (0, authService_1.updateAdminProfile)(req.admin.id, input);
        (0, response_1.successRes)(res, 'Admin profile updated successfully.', { admin }, 200);
    }
    catch (error) {
        next(error);
    }
}
async function changePasswordHandler(req, res, next) {
    try {
        const input = req.body;
        await (0, authService_1.changeAdminPassword)(req.admin.id, input.currentPassword, input.newPassword);
        (0, response_1.successRes)(res, 'Password updated successfully.', {}, 200);
    }
    catch (error) {
        next(error);
    }
}
async function requestPasswordResetHandler(req, res, next) {
    try {
        const { email, target } = req.body;
        const result = await (0, authService_1.requestPasswordReset)(email, target);
        (0, response_1.successRes)(res, result.message, {}, 200);
    }
    catch (error) {
        next(error);
    }
}
async function verifyPasswordResetHandler(req, res, next) {
    try {
        const { email, code, target } = req.body;
        const result = await (0, authService_1.verifyPasswordResetOtp)(email, code, target);
        (0, response_1.successRes)(res, 'Verification code confirmed.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function resetPasswordHandler(req, res, next) {
    try {
        const { email, resetToken, newPassword, target } = req.body;
        await (0, authService_1.resetPasswordWithOtp)(email, resetToken, newPassword, target);
        (0, response_1.successRes)(res, 'Password has been reset successfully. You can now sign in with your new password.', {}, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=authController.js.map