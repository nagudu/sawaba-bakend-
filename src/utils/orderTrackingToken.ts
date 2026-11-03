import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UnauthorizedError } from './errors'

/**
 * Signed, per-order, expiring token for guest order tracking.
 *
 * A customer who placed an order (with or without an account) receives a link
 * containing this token. The token grants READ-ONLY access to exactly one order
 * — it is bound to `orderId` + `referenceCode`, audience-scoped, and expires
 * after `ORDER_TRACKING_LINK_DAYS` (default 30). No database column is needed:
 * the signature makes it tamper-evident and unguessable.
 *
 * This is deliberately a bearer credential (link-only access): treat the URL as
 * sensitive. It can be regenerated at any time from the order lookup form.
 */

const AUDIENCE = 'order-tracking'

export interface OrderTrackingClaims {
  orderId: number
  referenceCode: string
}

interface OrderTrackingPayload extends OrderTrackingClaims {
  scope: 'order-track'
}

export function signOrderTrackingToken(claims: OrderTrackingClaims): string {
  const payload: OrderTrackingPayload = { ...claims, scope: 'order-track' }
  return jwt.sign(payload, env.jwtSecret, {
    audience: AUDIENCE,
    expiresIn: `${env.orderTracking.linkTtlDays}d`,
  })
}

export function verifyOrderTrackingToken(token: string): OrderTrackingClaims {
  try {
    const decoded = jwt.verify(token, env.jwtSecret, { audience: AUDIENCE }) as OrderTrackingPayload
    if (
      !decoded ||
      decoded.scope !== 'order-track' ||
      typeof decoded.orderId !== 'number' ||
      typeof decoded.referenceCode !== 'string'
    ) {
      throw new Error('Malformed order tracking token.')
    }
    return { orderId: decoded.orderId, referenceCode: decoded.referenceCode }
  } catch {
    throw new UnauthorizedError('This order link is invalid or has expired.')
  }
}

/** Full frontend URL a customer can open to view the order (no login, no OTP). */
export function buildOrderTrackingUrl(claims: OrderTrackingClaims): string {
  const token = signOrderTrackingToken(claims)
  const base = env.publicAppUrl.replace(/\/+$/, '')
  return `${base}/track?token=${encodeURIComponent(token)}`
}
