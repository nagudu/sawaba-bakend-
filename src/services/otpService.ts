import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UnprocessableError } from '../utils/errors'

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

export const OTP_TTL_MINUTES = 10
export const RESEND_COOLDOWN_SECONDS = 60
export const RESET_TOKEN_TTL_SECONDS = 300
export const MAX_OTP_ATTEMPTS = 5

/** CSPRNG 6-digit code, e.g. "048213". */
export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * One-way HMAC-SHA256 of a code bound to a scope string unique to the account,
 * e.g. `login:08031234567` or `customer:name@example.com`. The raw code is
 * never stored and cannot be recovered from the hash.
 */
export function hashOtp(code: string, scope: string): string {
  return crypto.createHmac('sha256', env.jwtSecret).update(`${scope}:${code}`).digest('hex')
}

export interface ResetTokenPayload {
  /** Account id in the target table. */
  sub: number
  email: string
  target: 'ADMIN' | 'BARBER' | 'CUSTOMER'
  otpId: number
  purpose: 'password_reset'
}

/**
 * Issues the short-lived token that proves the caller verified a reset code.
 * Only the verify step can mint it — the reset route trusts it instead of
 * asking for the code again (no oracle, no code reuse).
 */
export function signResetToken(payload: ResetTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: RESET_TOKEN_TTL_SECONDS,
  })
}

/** Verifies a reset token and returns its payload. */
export function verifyResetToken(token: string): ResetTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret)
    const payload = decoded as Partial<ResetTokenPayload>
    if (
      !payload ||
      payload.purpose !== 'password_reset' ||
      payload.target === null ||
      payload.target === undefined ||
      payload.otpId === undefined ||
      !payload.email
    ) {
      throw new Error('Malformed reset token')
    }
    return payload as ResetTokenPayload
  } catch {
    throw new UnprocessableError(
      'This reset session is invalid or has expired. Please request a new code.',
    )
  }
}