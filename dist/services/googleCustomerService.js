"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeholderPhoneForGoogle = placeholderPhoneForGoogle;
exports.loginOrRegisterWithGoogle = loginOrRegisterWithGoogle;
const node_crypto_1 = __importDefault(require("node:crypto"));
const client_1 = require("@prisma/client");
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const customerService_1 = require("./customerService");
const customerAuthService_1 = require("./customerAuthService");
function placeholderPhoneForGoogle(sub) {
    const digest = node_crypto_1.default.createHash('sha256').update(sub).digest('hex').slice(0, 20);
    return `G-${digest.toUpperCase()}`;
}
function isPlaceholderPhone(phone) {
    return typeof phone === 'string' && phone.startsWith('G-');
}
function deriveFullName(identity) {
    if (identity.name && identity.name.trim().length >= 2)
        return identity.name.trim().slice(0, 150);
    const local = identity.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    if (local && local.length >= 2) {
        return local
            .split(' ')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
            .slice(0, 150);
    }
    return 'SAWABA Customer';
}
async function issueSession(customer, outcome) {
    await (0, customerService_1.ensureCustomerCode)(customer);
    const updated = await database_1.prisma.customer.update({
        where: { id: customer.id },
        data: { lastLoginAt: new Date() },
    });
    return { token: (0, customerAuthService_1.signCustomerToken)(updated), customer: updated, outcome };
}
async function loginOrRegisterWithGoogle(identity) {
    // 1 ── Already linked to a SAWABA account.
    const linked = await database_1.prisma.customer.findFirst({ where: { googleSub: identity.sub } });
    if (linked) {
        if (!linked.isActive) {
            throw new errors_1.ForbiddenError('This account has been deactivated. Please contact the studio.');
        }
        return issueSession(linked, 'logged_in');
    }
    // 2 ── Link an existing email/password account.
    if (identity.email && identity.emailVerified) {
        const byEmail = await database_1.prisma.customer.findFirst({ where: { email: identity.email } });
        if (byEmail) {
            if (byEmail.googleSub && byEmail.googleSub !== identity.sub) {
                throw new errors_1.ConflictError('This email is already linked to a different Google account.');
            }
            if (!byEmail.isActive) {
                throw new errors_1.ForbiddenError('This account has been deactivated. Please contact the studio.');
            }
            const updated = await database_1.prisma.customer.update({
                where: { id: byEmail.id },
                data: {
                    googleSub: identity.sub,
                    ...(isPlaceholderPhone(byEmail.phone) && identity.name
                        ? { fullName: identity.name.trim().slice(0, 150) }
                        : {}),
                    ...(!byEmail.avatarUrl && identity.picture ? { avatarUrl: identity.picture } : {}),
                },
            });
            return issueSession(updated, 'linked');
        }
    }
    // 3 ── Brand new customer.
    try {
        const customer = await database_1.prisma.customer.create({
            data: {
                fullName: deriveFullName(identity),
                phone: placeholderPhoneForGoogle(identity.sub),
                email: identity.emailVerified ? identity.email : null,
                googleSub: identity.sub,
                avatarUrl: identity.picture,
                phoneVerified: false,
            },
        });
        return await issueSession(customer, 'created');
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const raced = await database_1.prisma.customer.findFirst({ where: { googleSub: identity.sub } });
            if (raced)
                return issueSession(raced, 'logged_in');
        }
        throw error;
    }
}
//# sourceMappingURL=googleCustomerService.js.map