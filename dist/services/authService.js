"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeAdmin = serializeAdmin;
exports.loginAdmin = loginAdmin;
exports.getMe = getMe;
exports.changeAdminPassword = changeAdminPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
function serializeAdmin(admin) {
    const { id, name, email, role, isActive, createdAt, updatedAt } = admin;
    return { id, name, email, role, isActive, createdAt, updatedAt };
}
async function loginAdmin(input) {
    const admin = await models_1.Admin.findOne({ where: { email: input.email } });
    if (!admin) {
        throw new errors_1.UnauthorizedError('Invalid email or password.');
    }
    if (!admin.isActive) {
        throw new errors_1.UnauthorizedError('This account has been deactivated. Contact support.');
    }
    const match = await bcryptjs_1.default.compare(input.password, admin.password);
    if (!match) {
        throw new errors_1.UnauthorizedError('Invalid email or password.');
    }
    const token = jsonwebtoken_1.default.sign({ sub: admin.id, email: admin.email, name: admin.name, role: admin.role }, env_1.env.jwtSecret, { expiresIn: env_1.env.jwtExpiresIn });
    return { token, admin: serializeAdmin(admin) };
}
async function getMe(adminId) {
    const admin = await models_1.Admin.findByPk(adminId);
    if (!admin) {
        throw new errors_1.UnauthorizedError('Account no longer exists.');
    }
    return serializeAdmin(admin);
}
async function changeAdminPassword(adminId, currentPassword, newPassword) {
    const admin = await models_1.Admin.findByPk(adminId);
    if (!admin) {
        throw new errors_1.UnauthorizedError('Account no longer exists.');
    }
    const match = await bcryptjs_1.default.compare(currentPassword, admin.password);
    if (!match) {
        throw new errors_1.AppError('Current password is incorrect.', 400);
    }
    admin.password = await bcryptjs_1.default.hash(newPassword, 12);
    await admin.save();
}
//# sourceMappingURL=authService.js.map