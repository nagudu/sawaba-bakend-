"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginBarber = loginBarber;
exports.getBarberMe = getBarberMe;
exports.changeBarberPassword = changeBarberPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const barberService_1 = require("./barberService");
/**
 * Issues a barber-portal JWT. Roles are explicitly checked by requireBarber,
 * so a barber token can never be used to hit admin endpoints and vice-versa.
 */
function signToken(barber) {
    return jsonwebtoken_1.default.sign({ sub: barber.id, email: barber.email ?? '', name: barber.name, role: 'BARBER' }, env_1.env.jwtSecret, { expiresIn: env_1.env.jwtExpiresIn });
}
/** Signs in a barber using their email OR phone and the admin-issued password. */
async function loginBarber(input) {
    const identifier = input.identifier.trim().toLowerCase();
    const byEmail = identifier.includes('@');
    const barber = await models_1.Barber.findOne({
        where: byEmail ? { email: identifier } : { phone: identifier },
    });
    if (!barber || !barber.passwordHash) {
        throw new errors_1.UnauthorizedError('Invalid login details.');
    }
    if (!barber.isActive) {
        throw new errors_1.UnauthorizedError('This barber account has been deactivated.');
    }
    if (!barber.portalEnabled) {
        throw new errors_1.UnauthorizedError('Portal access is not enabled for this account yet.');
    }
    const matches = await bcryptjs_1.default.compare(input.password, barber.passwordHash);
    if (!matches) {
        throw new errors_1.UnauthorizedError('Invalid login details.');
    }
    return { token: signToken(barber), barber: (0, barberService_1.serializeBarberForAdmin)(barber) };
}
/** Returns the scoped, portal-safe profile of the authenticated barber. */
async function getBarberMe(barberId) {
    const barber = await models_1.Barber.findByPk(barberId);
    if (!barber) {
        throw new errors_1.UnauthorizedError('Barber account no longer exists.');
    }
    return (0, barberService_1.serializeBarberForAdmin)(barber);
}
/** Allows a barber to rotate their own portal password. */
async function changeBarberPassword(barberId, input) {
    const barber = await models_1.Barber.findByPk(barberId);
    if (!barber) {
        throw new errors_1.UnauthorizedError('Barber account no longer exists.');
    }
    const matches = await bcryptjs_1.default.compare(input.currentPassword, barber.passwordHash ?? '');
    if (!matches) {
        throw new errors_1.AppError('Current password is incorrect.', 400);
    }
    barber.passwordHash = await bcryptjs_1.default.hash(input.newPassword, 12);
    await barber.save();
}
//# sourceMappingURL=barberAuthService.js.map