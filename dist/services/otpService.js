"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_OTP_ATTEMPTS = exports.RESET_TOKEN_TTL_SECONDS = exports.RESEND_COOLDOWN_SECONDS = exports.OTP_TTL_MINUTES = void 0;
exports.generateOtp = generateOtp;
exports.hashOtp = hashOtp;
exports.signResetToken = signResetToken;
exports.verifyResetToken = verifyResetToken;
const node_crypto_1 = __importDefault(require("node:crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const errors_1 = require("../utils/errors");
/**
 * Shared, provider-agnostic OTP primitives used by the admin/barber/customer
 * forgot-password flows and the customer phone-login flow.
 *
 * Security rules baked in here (never overridden by callers):
 *  - codes are CSPRNG-generated and stored HMAC-SHA256-hashed (never plaintext);
 *  - codes expire after OTP_TTL_MINUTES and are single-use;
 *  - verification is capped at MAX_OTP_ATTEMPTS per code;
 *  - a NEW code cannot be requested while a live one from the last
 *    RESEND_COOLDOWN_SECONDS is still unexpired;
 *  - a verified code is exchanged for a short-lived HMAC-signed reset token;
 *    the reset token is what authorises the actual password change.
 *
 * The code itself must NEVER leave this module to an API response, the
 * frontend, or the logs — email/SMS content is the only place it appears.
 */
exports.OTP_TTL_MINUTES = 10;
exports.RESEND_COOLDOWN_SECONDS = 60;
exports.RESET_TOKEN_TTL_SECONDS = 300;
exports.MAX_OTP_ATTEMPTS = 5;
/** CSPRNG 6-digit code, e.g. "048213". */
function generateOtp() {
    return String(node_crypto_1.default.randomInt(0, 1_000_000)).padStart(6, '0');
}
/**
 * One-way HMAC-SHA256 of a code bound to a scope string unique to the account,
 * e.g. `login:08031234567` or `customer:name@example.com`. The raw code is
 * never stored and cannot be recovered from the hash.
 */
function hashOtp(code, scope) {
    return node_crypto_1.default.createHmac('sha256', env_1.env.jwtSecret).update(`${scope}:${code}`).digest('hex');
}
/**
 * Issues the short-lived token that proves the caller verified a reset code.
 * Only the verify step can mint it — the reset route trusts it instead of
 * asking for the code again (no oracle, no code reuse).
 */
function signResetToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.jwtSecret, {
        expiresIn: exports.RESET_TOKEN_TTL_SECONDS,
    });
}
/** Verifies a reset token and returns its payload. */
function verifyResetToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        const payload = decoded;
        if (!payload ||
            payload.purpose !== 'password_reset' ||
            payload.target === null ||
            payload.target === undefined ||
            payload.otpId === undefined ||
            !payload.email) {
            throw new Error('Malformed reset token');
        }
        return payload;
    }
    catch {
        throw new errors_1.UnprocessableError('This reset session is invalid or has expired. Please request a new code.');
    }
}
//# sourceMappingURL=otpService.js.map