import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import type { Customer } from '@prisma/client'
import { ConflictError, ForbiddenError } from '../utils/errors'
import { ensureCustomerCode } from './customerService'
import { signCustomerToken } from './customerAuthService'
import type { GoogleIdentity } from './googleAuthService'

export type GoogleAuthOutcome = 'logged_in' | 'linked' | 'created'

export interface GoogleAuthResult {
  token: string
  customer: Customer
  outcome: GoogleAuthOutcome
}

export function placeholderPhoneForGoogle(sub: string): string {
  const digest = crypto.createHash('sha256').update(sub).digest('hex').slice(0, 20)
  return `G-${digest.toUpperCase()}`
}

function isPlaceholderPhone(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && phone.startsWith('G-')
}

function deriveFullName(identity: GoogleIdentity): string {
  if (identity.name && identity.name.trim().length >= 2) return identity.name.trim().slice(0, 150)
  const local = identity.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim()
  if (local && local.length >= 2) {
    return local
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
      .slice(0, 150)
  }
  return 'SAWABA Customer'
}

async function issueSession(
  customer: Customer,
  outcome: GoogleAuthOutcome,
): Promise<GoogleAuthResult> {
  await ensureCustomerCode(customer)
  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { lastLoginAt: new Date() },
  })
  return { token: signCustomerToken(updated), customer: updated, outcome }
}

export async function loginOrRegisterWithGoogle(
  identity: GoogleIdentity,
): Promise<GoogleAuthResult> {
  // 1 ── Already linked to a SAWABA account.
  const linked = await prisma.customer.findFirst({ where: { googleSub: identity.sub } })
  if (linked) {
    if (!linked.isActive) {
      throw new ForbiddenError('This account has been deactivated. Please contact the studio.')
    }
    return issueSession(linked, 'logged_in')
  }

  // 2 ── Link an existing email/password account.
  if (identity.email && identity.emailVerified) {
    const byEmail = await prisma.customer.findFirst({ where: { email: identity.email } })
    if (byEmail) {
      if (byEmail.googleSub && byEmail.googleSub !== identity.sub) {
        throw new ConflictError(
          'This email is already linked to a different Google account.',
        )
      }
      if (!byEmail.isActive) {
        throw new ForbiddenError('This account has been deactivated. Please contact the studio.')
      }
      const updated = await prisma.customer.update({
        where: { id: byEmail.id },
        data: {
          googleSub: identity.sub,
          ...(isPlaceholderPhone(byEmail.phone) && identity.name
            ? { fullName: identity.name.trim().slice(0, 150) }
            : {}),
          ...(!byEmail.avatarUrl && identity.picture ? { avatarUrl: identity.picture } : {}),
        },
      })
      return issueSession(updated, 'linked')
    }
  }

  // 3 ── Brand new customer.
  try {
    const customer = await prisma.customer.create({
      data: {
        fullName: deriveFullName(identity),
        phone: placeholderPhoneForGoogle(identity.sub),
        email: identity.emailVerified ? identity.email : null,
        googleSub: identity.sub,
        avatarUrl: identity.picture,
        phoneVerified: false,
      },
    })
    return await issueSession(customer, 'created')
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await prisma.customer.findFirst({ where: { googleSub: identity.sub } })
      if (raced) return issueSession(raced, 'logged_in')
    }
    throw error
  }
}
