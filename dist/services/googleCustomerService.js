"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeholderPhoneForGoogle = placeholderPhoneForGoogle;
exports.loginOrRegisterWithGoogle = loginOrRegisterWithGoogle;
const node_crypto_1 = __importDefault(require("node:crypto"));
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const customerService_1 = require("./customerService");
const customerAuthService_1 = require("./customerAuthService");
/**
 * Google never gives us a phone number, but `customers.phone` is NOT NULL and
 * is this system's account key. Google-only accounts therefore get a stable,
 * obviously-synthetic placeholder derived from their `sub`, and are flagged
 * `phoneVerified = false` so the UI can ask for a real number. It is
 * deterministic, so a retried sign-in maps to the same value.
 */
function placeholderPhoneForGoogle(sub) {
    const digest = node_crypto_1.default.createHash('sha256').update(sub).digest('hex').slice(0, 20);
    return `G-${digest.toUpperCase()}`;
}
function isPlaceholderPhone(phone) {
    return typeof phone === 'string' && phone.startsWith('G-');
}
/** Google may omit the name (e.g. gmail addresses); fall back to the mailbox name. */
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
    await customer.update({ lastLoginAt: new Date() });
    return { token: (0, customerAuthService_1.signCustomerToken)(customer), customer, outcome };
}
/**
 * Signs a customer in with a verified Google identity, creating the account
 * only when it genuinely does not exist yet.
 *
 * Resolution order (never creates a duplicate):
 *   1. `googleSub` already linked      -> sign in
 *   2. same email, Google-verified     -> LINK the Google account, sign in
 *   3. otherwise                       -> create, sign in
 */
async function loginOrRegisterWithGoogle(identity) {
    // 1 ── Already linked to a SAWABA account.
    const linked = await models_1.Customer.findOne({ where: { googleSub: identity.sub } });
    if (linked) {
        if (!linked.isActive) {
            throw new errors_1.ForbiddenError('This account has been deactivated. Please contact the studio.');
        }
        return issueSession(linked, 'logged_in');
    }
    // 2 ── Link an existing email/password account. Only ever for an email that
    //      Google has confirmed, so an unverified Google address cannot hijack
    //      an existing customer.
    if (identity.email && identity.emailVerified) {
        const byEmail = await models_1.Customer.findOne({ where: { email: identity.email } });
        if (byEmail) {
            if (byEmail.googleSub && byEmail.googleSub !== identity.sub) {
                throw new errors_1.ConflictError('This email is already linked to a different Google account.');
            }
            if (!byEmail.isActive) {
                throw new errors_1.ForbiddenError('This account has been deactivated. Please contact the studio.');
            }
            await byEmail.update({
                googleSub: identity.sub,
                // Keep a name the customer typed themselves; only fill blanks.
                ...(isPlaceholderPhone(byEmail.phone) && identity.name
                    ? { fullName: identity.name.trim().slice(0, 150) }
                    : {}),
                ...(!byEmail.avatarUrl && identity.picture ? { avatarUrl: identity.picture } : {}),
            });
            return issueSession(byEmail, 'linked');
        }
    }
    // 3 ── Brand new customer.
    try {
        const customer = await models_1.Customer.create({
            fullName: deriveFullName(identity),
            phone: placeholderPhoneForGoogle(identity.sub),
            email: identity.emailVerified ? identity.email : null,
            googleSub: identity.sub,
            avatarUrl: identity.picture,
            phoneVerified: false,
        });
        return await issueSession(customer, 'created');
    }
    catch (error) {
        // Two tabs/double-tap can race here; the unique google_sub index settles it.
        if (error instanceof sequelize_1.UniqueConstraintError) {
            const raced = await models_1.Customer.findOne({ where: { googleSub: identity.sub } });
            if (raced)
                return issueSession(raced, 'logged_in');
        }
        throw error;
    }
}
//# sourceMappingURL=googleCustomerService.js.map