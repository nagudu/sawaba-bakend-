import { rateLimit } from 'express-rate-limit'

const defaultConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
}

/** General API limiter: 300 requests per 15 minutes per IP. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  ...defaultConfig,
})

/**
 * Admin auth limiter: 10 FAILED attempts per 15 minutes per IP.
 * `skipSuccessfulRequests` means a CORRECT login never consumes the bucket —
 * normal users can sign in repeatedly without ever seeing "Too many requests",
 * while brute-forcing wrong passwords is still cut off at 10/15 min.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  ...defaultConfig,
})

/** Customer password login / register: 20 FAILED attempts per 15 min per IP. */
export const customerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  ...defaultConfig,
})

/** OTP request/verify: 10 per 15 min per IP (sends email — costly and abusable). */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  ...defaultConfig,
})

/** Limiter for public submission endpoints (bookings, contact, reviews). */
export const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  ...defaultConfig,
})