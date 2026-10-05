"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginHandler = loginHandler;
exports.meHandler = meHandler;
exports.changePasswordHandler = changePasswordHandler;
const authService_1 = require("../services/authService");
const response_1 = require("../utils/response");
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
//# sourceMappingURL=authController.js.map