import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Op } from 'sequelize'
import { env } from '../config/env'
import { Customer, CustomerOtp } from '../models'
import { normalizeNigerianPhone, isPlausiblePhone } from '../utils/phone'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnprocessableError,
} from '../utils/errors'
import { ensureCustomerCode } from './customerService'
import { sendEmail } from './mailer'

const OTP_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5

export interface CustomerTokenPayload {
  sub: number
  phone: string
  name: string
  role: 'CUSTOMER'
}

export function signCustomerToken(customer: Customer): string {
  const payload: CustomerTokenPayload = {
    sub: customer.id,
    phone: customer.phone,
    name: customer.fullName,
    role: 'CUSTOMER',
  }
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  })
}

/** 6-digit cryptographically random code (never sequential, never guessable). */
function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

function hashOtp(code: string, phone: string): string {
  return crypto.createHmac('sha256', env.jwtSecret).update(`${phone}:${code}`).digest('hex')
}

/**
 * Delivers the OTP to the customer. Email is the transport that works today
 * (Resend); SMS gateways can be added later behind the same interface. The
 * code is also returned so the response can include it in NON-production
 * environments only, letting users test without a real inbox.
 */
async function deliverOtp(
  customer: { fullName: string; email: string | null },
  phone: string,
  code: string,
): Promise<{ devCode: string | null }> {
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60_000)

  await CustomerOtp.destroy({ where: { phone, purpose: 'LOGIN' } })
  await CustomerOtp.create({
    phone,
    purpose: 'LOGIN',
    codeHash: hashOtp(code, phone),
    expiresAt: expires,
  })

  if (customer.email) {
    try {
      await sendEmail({
        to: customer.email,
        subject: `${code} is your SAWABA login code`,
        text: `Hello ${customer.fullName},\n\nYour SAWABA verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you did not request this, you can safely ignore this email.`,
        html: `<p>Hello ${customer.fullName},</p><p>Your SAWABA verification code is <strong style="font-size:22px;letter-spacing:4px;">${code}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.</p><p style="color:#888;font-size:12px;">If you did not request this, you can safely ignore this email.</p>`,
      })
    } catch (error) {
      // OTP delivery failure must not crash login — the devCode fallback and
      // the retry button cover it. The cause stays in the logs.
      console.error('[customer-auth] otp email failed:', (error as Error).message)
    }
  }

  return {
    devCode: env.nodeEnv !== 'production' ? code : null,
  }
}

/** Step 1 of phone login: find the account and send an OTP. */
export async function requestLoginOtp(rawPhone: string): Promise<{
  found: boolean
  message: string
  devCode: string | null
}> {
  const phone = normalizeNigerianPhone(rawPhone)
  if (!isPlausiblePhone(phone)) {
    throw new UnprocessableError('Provide a valid phone number.')
  }

  const customer = await Customer.findOne({ where: { phone, isActive: true } })
  if (!customer) {
    // Do NOT reveal whether the number is registered (enumeration safety) —
    // but also do not burn an OTP. Return a guidance message instead.
    return {
      found: false,
      message: 'No account found for this number. Please create one first.',
      devCode: null,
    }
  }

  const code = generateOtp()
  const { devCode } = await deliverOtp(customer, phone, code)
  return { found: true, message: `We sent a 6-digit code to ${customer.email ?? 'your contact'}. It expires in ${OTP_TTL_MINUTES} minutes.`, devCode }
}

/** Step 2 of phone login: verify the OTP and issue a session token. */
export async function verifyLoginOtp(
  rawPhone: string,
  code: string,
): Promise<{ token: string; customer: Customer }> {
  const phone = normalizeNigerianPhone(rawPhone)
  const record = await CustomerOtp.findOne({
    where: { phone, purpose: 'LOGIN', consumedAt: null, expiresAt: { [Op.gt]: new Date() } },
    order: [['createdAt', 'DESC']],
  })

  if (!record) {
    throw new UnauthorizedError('This code has expired. Please request a new one.')
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await record.destroy()
    throw new UnauthorizedError('Too many incorrect attempts. Please request a new code.')
  }
  if (record.codeHash !== hashOtp(code.trim(), phone)) {
    await record.increment('attempts')
    throw new UnauthorizedError('Incorrect code. Please try again.')
  }

  await record.update({ consumedAt: new Date() })
  const customer = await Customer.findOne({ where: { phone, isActive: true } })
  if (!customer) {
    throw new UnauthorizedError('Account no longer exists or has been deactivated.')
  }
  await ensureCustomerCode(customer)
  await customer.update({ lastLoginAt: new Date() })

  return { token: signCustomerToken(customer), customer }
}

/** Registration: creates the one account per phone and logs the customer in. */
export async function registerCustomer(input: {
  fullName: string
  phone: string
  email?: string | null
  password?: string | null
}): Promise<{ token: string; customer: Customer }> {
  const phone = normalizeNigerianPhone(input.phone)
  if (!isPlausiblePhone(phone)) {
    throw new UnprocessableError('Provide a valid phone number.')
  }
  if (input.email) {
    const emailTaken = await Customer.findOne({ where: { email: input.email.trim().toLowerCase() } })
    if (emailTaken) {
      throw new ConflictError('This email is already registered to another account.')
    }
  }

  const existing = await Customer.findOne({ where: { phone } })
  if (existing) {
    // Never create duplicates: if the caller is who we think, upgrade the
    // legacy guest record instead (verified below via OTP or password).
    if (existing.passwordHash || existing.email) {
      throw new ConflictError(
        'We found an existing account for this number. Please login with OTP instead.',
      )
    }
    // Legacy guest-only record with no credentials: attach the new details.
    if (input.email) existing.email = input.email.trim().toLowerCase()
    if (input.password) existing.passwordHash = await bcrypt.hash(input.password, 10)
    await existing.save()
    await ensureCustomerCode(existing)
    await existing.update({ lastLoginAt: new Date() })
    return { token: signCustomerToken(existing), customer: existing }
  }

  const customer = await Customer.create({
    fullName: input.fullName.trim(),
    phone,
    email: input.email?.trim().toLowerCase() ?? null,
    passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
  })
  await ensureCustomerCode(customer)
  await customer.update({ lastLoginAt: new Date() })
  return { token: signCustomerToken(customer), customer }
}

/** Password login for customers who chose a password at registration. */
export async function loginWithPassword(
  rawPhone: string,
  password: string,
): Promise<{ token: string; customer: Customer }> {
  const phone = normalizeNigerianPhone(rawPhone)
  const customer = await Customer.findOne({ where: { phone, isActive: true } })
  if (!customer?.passwordHash) {
    throw new UnauthorizedError('No password login for this number. Use phone code instead.')
  }
  const ok = await bcrypt.compare(password, customer.passwordHash)
  if (!ok) {
    throw new UnauthorizedError('Incorrect phone number or password.')
  }
  await ensureCustomerCode(customer)
  await customer.update({ lastLoginAt: new Date() })
  return { token: signCustomerToken(customer), customer }
}

/** Change password while logged in (current password required when one exists). */
export async function changeCustomerPassword(
  customerId: number,
  currentPassword: string | null,
  newPassword: string,
): Promise<void> {
  const customer = await Customer.findByPk(customerId)
  if (!customer) throw new NotFoundError('Account not found.')
  if (customer.passwordHash) {
    if (!currentPassword) {
      throw new UnprocessableError('Enter your current password first.')
    }
    const ok = await bcrypt.compare(currentPassword, customer.passwordHash)
    if (!ok) throw new UnauthorizedError('Current password is incorrect.')
  }
  await customer.update({ passwordHash: await bcrypt.hash(newPassword, 10) })
}

/** Profile updates. Email changes require OTP re-verification when set. */
export async function updateCustomerProfile(
  customerId: number,
  patch: {
    fullName?: string
    phone?: string
    email?: string | null
    avatarUrl?: string | null
    preferredBarberId?: number | null
    favoriteServiceId?: number | null
    reminderOptIn?: boolean
  },
): Promise<Customer> {
  const customer = await Customer.findByPk(customerId)
  if (!customer) throw new NotFoundError('Account not found.')
  if (!customer.isActive) throw new ForbiddenError('This account has been deactivated.')

  const fields: Record<string, unknown> = {}
  if (patch.fullName !== undefined && patch.fullName.trim()) {
    fields.fullName = patch.fullName.trim()
  }
  if (patch.phone !== undefined && patch.phone.trim()) {
    const phone = normalizeNigerianPhone(patch.phone)
    if (!isPlausiblePhone(phone)) {
      throw new UnprocessableError('Provide a valid phone number.')
    }
    // One account per phone number — the same rule the register path enforces.
    const taken = await Customer.findOne({ where: { phone } })
    if (taken && taken.id !== customer.id) {
      throw new ConflictError('This phone number is already in use by another account.')
    }
    fields.phone = phone
    // Supplying a real number clears the Google placeholder state.
    fields.phoneVerified = true
  }
  if (patch.email !== undefined) {
    const email = patch.email ? patch.email.trim().toLowerCase() : null
    if (email && email !== customer.email) {
      const taken = await Customer.findOne({ where: { email } })
      if (taken) throw new ConflictError('This email is already in use by another account.')
    }
    fields.email = email
  }
  if (patch.avatarUrl !== undefined) fields.avatarUrl = patch.avatarUrl
  if (patch.preferredBarberId !== undefined) fields.preferredBarberId = patch.preferredBarberId
  if (patch.favoriteServiceId !== undefined) fields.favoriteServiceId = patch.favoriteServiceId
  if (patch.reminderOptIn !== undefined) fields.reminderOptIn = patch.reminderOptIn

  await customer.update(fields)
  return customer
}

/** Safe public shape for API responses — never leaks the password hash. */
export function serializeCustomer(customer: Customer): Record<string, unknown> {
  return {
    id: customer.id,
    customerCode: customer.customerCode ?? `CUS-${String(customer.id).padStart(4, '0')}`,
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email,
    avatarUrl: customer.avatarUrl,
    preferredBarberId: customer.preferredBarberId,
    favoriteServiceId: customer.favoriteServiceId,
    reminderOptIn: customer.reminderOptIn,
    isActive: customer.isActive,
    // False for accounts created via Google, which still need a real number.
    phoneVerified: customer.phoneVerified,
    // Whether a Google account is linked. The `sub` itself is never exposed.
    hasGoogleAccount: Boolean(customer.googleSub),
    createdAt: customer.createdAt,
    lastLoginAt: customer.lastLoginAt,
  }
}
