"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitLimiter = exports.otpLimiter = exports.customerAuthLimiter = exports.authLimiter = exports.apiLimiter = void 0;
const express_rate_limit_1 = require("express-rate-limit");
const defaultConfig = {
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests. Please try again later.',
    },
};
/** General API limiter: 300 requests per 15 minutes per IP. */
exports.apiLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    ...defaultConfig,
});
/**
 * Admin auth limiter: 10 FAILED attempts per 15 minutes per IP.
 * `skipSuccessfulRequests` means a CORRECT login never consumes the bucket —
 * normal users can sign in repeatedly without ever seeing "Too many requests",
 * while brute-forcing wrong passwords is still cut off at 10/15 min.
 */
exports.authLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    ...defaultConfig,
});
/** Customer password login / register: 20 FAILED attempts per 15 min per IP. */
exports.customerAuthLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    ...defaultConfig,
});
/** OTP request/verify: 10 per 15 min per IP (sends email — costly and abusable). */
exports.otpLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    ...defaultConfig,
});
/** Limiter for public submission endpoints (bookings, contact, reviews). */
exports.submitLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    ...defaultConfig,
});
//# sourceMappingURL=rateLimiter.js.map