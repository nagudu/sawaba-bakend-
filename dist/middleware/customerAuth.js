"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireCustomer = requireCustomer;
exports.attachCustomerIfPresent = attachCustomerIfPresent;
exports.assertCustomerActive = assertCustomerActive;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
/**
 * Customer JWT guard. The backend ALWAYS resolves the customer from the
 * signed token — customerId values in the request body/query are ignored for
 * authorization, so one customer can never read or change another's data.
 */
async function requireCustomer(req, _res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.UnauthorizedError('Please login to continue.');
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(authHeader.slice(7), env_1.env.jwtSecret);
        }
        catch {
            throw new errors_1.UnauthorizedError('Your session has expired. Please login again.');
        }
        if (payload.role !== 'CUSTOMER') {
            throw new errors_1.UnauthorizedError('This area requires a customer account.');
        }
        const customer = await models_1.Customer.findByPk(payload.sub);
        if (!customer || !customer.isActive) {
            throw new errors_1.UnauthorizedError('Account no longer exists or has been deactivated.');
        }
        req.customer = customer;
        next();
    }
    catch (error) {
        next(error);
    }
}
/** Optional variant: attaches the customer when a valid token exists, else continues. */
async function attachCustomerIfPresent(req, _res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const payload = jsonwebtoken_1.default.verify(authHeader.slice(7), env_1.env.jwtSecret);
            if (payload.role === 'CUSTOMER') {
                const customer = await models_1.Customer.findByPk(payload.sub);
                if (customer?.isActive)
                    req.customer = customer;
            }
        }
    }
    catch {
        // Invalid/expired token on an optional route: treat as guest.
    }
    next();
}
function assertCustomerActive(customer) {
    if (!customer.isActive) {
        throw new errors_1.ForbiddenError('This account has been deactivated. Please contact the salon.');
    }
}
//# sourceMappingURL=customerAuth.js.map