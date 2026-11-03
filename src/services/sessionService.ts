import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'
import { env } from '../config/env'
import { ForbiddenError, UnauthorizedError } from '../utils/errors'

/**
 * Resolves which account a token belongs to, across all four token namespaces.
 * The JWT `role` claim is the only discriminator (same secret, distinct roles),
 * and every lookup enforces the same live-account rules as that role's middleware.
 * This never trusts a client-supplied role.
 */

export type SessionRole = 'ADMIN' | 'VENDOR' | 'CUSTOMER' | 'BARBER'

export interface SessionProfile {
  id: number
  name: string
  email: string | null
  phone: string | null
  status: string | null
}

export interface SessionIdentity {
  role: SessionRole
  profile: SessionProfile
  expiresAt: string | null
}

interface TokenPayload {
  sub?: number | string
  role?: string
  email?: string
  name?: string
  exp?: number
}

export async function resolveSession(token: string): Promise<SessionIdentity> {
  let payload: TokenPayload
  try {
    payload = jwt.verify(token, env.jwtSecret) as TokenPayload
  } catch {
    throw new UnauthorizedError('Your session has expired. Please sign in again.')
  }

  const subject = Number(payload.sub)
  if (!Number.isInteger(subject) || subject <= 0) {
    throw new UnauthorizedError('Invalid session.')
  }
  const expiresAt = payload.exp ? new Date(payload.exp * 1000).toISOString() : null
  const role = payload.role as SessionRole

  switch (role) {
    case 'ADMIN': {
      const admin = await prisma.admin.findUnique({ where: { id: subject } })
      if (!admin || !admin.isActive) {
        throw new UnauthorizedError('Account no longer exists or has been deactivated.')
      }
      return {
        role,
        expiresAt,
        profile: { id: admin.id, name: admin.name, email: admin.email, phone: null, status: admin.role },
      }
    }
    case 'VENDOR': {
      const vendor = await prisma.vendor.findUnique({ where: { id: subject } })
      if (!vendor || !vendor.isActive) {
        throw new UnauthorizedError('Vendor account no longer exists or has been deactivated.')
      }
      if (vendor.status === 'REJECTED' || vendor.status === 'SUSPENDED') {
        throw new ForbiddenError(`This vendor account is ${vendor.status.toLowerCase()}.`)
      }
      return {
        role,
        expiresAt,
        profile: {
          id: vendor.id,
          name: vendor.businessName,
          email: vendor.email,
          phone: vendor.phone,
          status: vendor.status,
        },
      }
    }
    case 'CUSTOMER': {
      const customer = await prisma.customer.findUnique({ where: { id: subject } })
      if (!customer || !customer.isActive) {
        throw new UnauthorizedError('Account no longer exists or has been deactivated.')
      }
      return {
        role,
        expiresAt,
        profile: {
          id: customer.id,
          name: customer.fullName,
          email: customer.email,
          phone: customer.phone,
          status: 'ACTIVE',
        },
      }
    }
    case 'BARBER': {
      const barber = await prisma.barber.findUnique({ where: { id: subject } })
      if (!barber || !barber.isActive) {
        throw new UnauthorizedError('Barber account no longer exists or has been deactivated.')
      }
      if (!barber.portalEnabled || !barber.passwordHash) {
        throw new UnauthorizedError('Barber portal access is not enabled for this account.')
      }
      return {
        role,
        expiresAt,
        profile: {
          id: barber.id,
          name: barber.name,
          email: barber.email,
          phone: barber.phone,
          status: 'ACTIVE',
        },
      }
    }
    default:
      throw new UnauthorizedError('Invalid session.')
  }
}
