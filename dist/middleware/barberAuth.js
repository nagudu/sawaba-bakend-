"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireBarber = requireBarber;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
/**
 * Guards the Barber Portal API. Validates a `BARBER`-role JWT and loads the
 * barber, enforcing that their profile is active AND portal access is enabled.
 */
async function requireBarber(req, _res, next) {
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
        if (payload.role !== 'BARBER') {
            throw new errors_1.ForbiddenError('This token is not valid for the barber portal.');
        }
        const barber = await models_1.Barber.findByPk(payload.sub);
        if (!barber || !barber.isActive) {
            throw new errors_1.UnauthorizedError('Barber account no longer exists or has been deactivated.');
        }
        if (!barber.portalEnabled || !barber.passwordHash) {
            throw new errors_1.UnauthorizedError('Barber portal access is not enabled for this account.');
        }
        req.barber = barber;
        next();
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=barberAuth.js.map