import crypto from 'node:crypto'
import { UniqueConstraintError } from 'sequelize'
import { Customer } from '../models'
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

/**
 * Google never gives us a phone number, but `customers.phone` is NOT NULL and
 * is this system's account key. Google-only accounts therefore get a stable,
 * obviously-synthetic placeholder derived from their `sub`, and are flagged
 * `phoneVerified = false` so the UI can ask for a real number. It is
 * deterministic, so a retried sign-in maps to the same value.
 */
export function placeholderPhoneForGoogle(sub: string): string {
  const digest = crypto.createHash('sha256').update(sub).digest('hex').slice(0, 20)
  return `G-${digest.toUpperCase()}`
}

function isPlaceholderPhone(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && phone.startsWith('G-')
}

/** Google may omit the name (e.g. gmail addresses); fall back to the mailbox name. */
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
  await customer.update({ lastLoginAt: new Date() })
  return { token: signCustomerToken(customer), customer, outcome }
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
export async function loginOrRegisterWithGoogle(
  identity: GoogleIdentity,
): Promise<GoogleAuthResult> {
  // 1 ── Already linked to a SAWABA account.
  const linked = await Customer.findOne({ where: { googleSub: identity.sub } })
  if (linked) {
    if (!linked.isActive) {
      throw new ForbiddenError('This account has been deactivated. Please contact the studio.')
    }
    return issueSession(linked, 'logged_in')
  }

  // 2 ── Link an existing email/password account. Only ever for an email that
  //      Google has confirmed, so an unverified Google address cannot hijack
  //      an existing customer.
  if (identity.email && identity.emailVerified) {
    const byEmail = await Customer.findOne({ where: { email: identity.email } })
    if (byEmail) {
      if (byEmail.googleSub && byEmail.googleSub !== identity.sub) {
        throw new ConflictError(
          'This email is already linked to a different Google account.',
        )
      }
      if (!byEmail.isActive) {
        throw new ForbiddenError('This account has been deactivated. Please contact the studio.')
      }
      await byEmail.update({
        googleSub: identity.sub,
        // Keep a name the customer typed themselves; only fill blanks.
        ...(isPlaceholderPhone(byEmail.phone) && identity.name
          ? { fullName: identity.name.trim().slice(0, 150) }
          : {}),
        ...(!byEmail.avatarUrl && identity.picture ? { avatarUrl: identity.picture } : {}),
      })
      return issueSession(byEmail, 'linked')
    }
  }

  // 3 ── Brand new customer.
  try {
    const customer = await Customer.create({
      fullName: deriveFullName(identity),
      phone: placeholderPhoneForGoogle(identity.sub),
      email: identity.emailVerified ? identity.email : null,
      googleSub: identity.sub,
      avatarUrl: identity.picture,
      phoneVerified: false,
    })
    return await issueSession(customer, 'created')
  } catch (error) {
    // Two tabs/double-tap can race here; the unique google_sub index settles it.
    if (error instanceof UniqueConstraintError) {
      const raced = await Customer.findOne({ where: { googleSub: identity.sub } })
      if (raced) return issueSession(raced, 'logged_in')
    }
    throw error
  }
}
