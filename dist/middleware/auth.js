"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
async function requireAdmin(req, _res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.UnauthorizedError('Access token is missing or invalid.');
        }
        const token = authHeader.slice(7);
        let payload;
        try {
            const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
            payload = decoded;
        }
        catch {
            throw new errors_1.UnauthorizedError('Access token is expired or invalid.');
        }
        const admin = await models_1.Admin.findByPk(payload.sub);
        if (!admin || !admin.isActive) {
            throw new errors_1.UnauthorizedError('Account no longer exists or has been deactivated.');
        }
        req.admin = admin;
        next();
    }
    catch (error) {
        next(error);
    }
}
function requireRole(...roles) {
    return (req, _res, next) => {
        const admin = req.admin;
        if (!admin) {
            next(new errors_1.UnauthorizedError('Authentication required.'));
            return;
        }
        if (!roles.includes(admin.role)) {
            next(new errors_1.ForbiddenError('You do not have permission to perform this action.'));
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map