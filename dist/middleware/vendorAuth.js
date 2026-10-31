"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireVendor = requireVendor;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
/**
 * Vendor portal authentication — a separate namespace from admin/customer so
 * tokens never cross. Vendors only ever reach data scoped to their own id;
 * authorization is enforced HERE (backend), never only in the frontend.
 */
async function requireVendor(req, _res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.UnauthorizedError('Access token is missing or invalid.');
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(authHeader.slice(7), env_1.env.jwtSecret);
        }
        catch {
            throw new errors_1.UnauthorizedError('Access token is expired or invalid.');
        }
        if (payload.role !== 'VENDOR') {
            throw new errors_1.ForbiddenError('This token is not valid for the vendor portal.');
        }
        const vendor = await database_1.prisma.vendor.findUnique({ where: { id: payload.sub } });
        if (!vendor || !vendor.isActive) {
            throw new errors_1.UnauthorizedError('Vendor account no longer exists or has been deactivated.');
        }
        if (vendor.status === 'REJECTED') {
            throw new errors_1.ForbiddenError('This vendor application has been rejected.');
        }
        if (vendor.status === 'SUSPENDED') {
            throw new errors_1.ForbiddenError('This vendor account has been suspended.');
        }
        req.vendor = vendor;
        next();
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=vendorAuth.js.map