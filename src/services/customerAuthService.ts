import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../config/database'
import type { Customer } from '@prisma/client'
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

function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

function hashOtp(code: string, phone: string): string {
  return crypto.createHmac('sha256', env.jwtSecret).update(`${phone}:${code}`).digest('hex')
}

async function deliverOtp(
  customer: { fullName: string; email: string | null },
  phone: string,
  code: string,
): Promise<{ devCode: string | null }> {
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60_000)

  await prisma.customerOtp.deleteMany({ where: { phone, purpose: 'LOGIN' } })
  await prisma.customerOtp.create({
    data: {
      phone,
      purpose: 'LOGIN',
      codeHash: hashOtp(code, phone),
      expiresAt: expires,
    },
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
      console.error('[customer-auth] otp email failed:', (error as Error).message)
    }
  }

  return {
    devCode: env.nodeEnv !== 'production' ? code : null,
  }
}

export async function requestLoginOtp(rawPhone: string): Promise<{
  found: boolean
  message: string
  devCode: string | null
}> {
  const phone = normalizeNigerianPhone(rawPhone)
  if (!isPlausiblePhone(phone)) {
    throw new UnprocessableError('Provide a valid phone number.')
  }

  const customer = await prisma.customer.findFirst({ where: { phone, isActive: true } })
  if (!customer) {
    return {
      found: false,
      message: 'No account found for this number. Please create one first.',
      devCode: null,
    }
  }

  const code = generateOtp()
  const { devCode } = await deliverOtp(customer, phone, code)
  return {
    found: true,
    message: `We sent a 6-digit code to ${customer.email ?? 'your contact'}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    devCode,
  }
}

export async function verifyLoginOtp(
  rawPhone: string,
  code: string,
): Promise<{ token: string; customer: Customer }> {
  const phone = normalizeNigerianPhone(rawPhone)
  const record = await prisma.customerOtp.findFirst({
    where: { phone, purpose: 'LOGIN', consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })

  if (!record) {
    throw new UnauthorizedError('This code has expired. Please request a new one.')
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.customerOtp.delete({ where: { id: record.id } })
    throw new UnauthorizedError('Too many incorrect attempts. Please request a new code.')
  }
  if (record.codeHash !== hashOtp(code.trim(), phone)) {
    await prisma.customerOtp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    throw new UnauthorizedError('Incorrect code. Please try again.')
  }

  await prisma.customerOtp.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })

  const customer = await prisma.customer.findFirst({ where: { phone, isActive: true } })
  if (!customer) {
    throw new UnauthorizedError('Account no longer exists or has been deactivated.')
  }
  await ensureCustomerCode(customer)
  const updatedCustomer = await prisma.customer.update({
    where: { id: customer.id },
    data: { lastLoginAt: new Date() },
  })

  return { token: signCustomerToken(updatedCustomer), customer: updatedCustomer }
}

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
    const emailTaken = await prisma.customer.findFirst({
      where: { email: input.email.trim().toLowerCase() },
    })
    if (emailTaken) {
      throw new ConflictError('This email is already registered to another account.')
    }
  }

  const existing = await prisma.customer.findFirst({ where: { phone } })
  if (existing) {
    if (existing.passwordHash || existing.email) {
      throw new ConflictError(
        'We found an existing account for this number. Please login with OTP instead.',
      )
    }
    const data: { email?: string; passwordHash?: string; lastLoginAt: Date } = {
      lastLoginAt: new Date(),
    }
    if (input.email) data.email = input.email.trim().toLowerCase()
    if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10)

    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data,
    })
    await ensureCustomerCode(updated)
    return { token: signCustomerToken(updated), customer: updated }
  }

  const customer = await prisma.customer.create({
    data: {
      fullName: input.fullName.trim(),
      phone,
      email: input.email?.trim().toLowerCase() ?? null,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
      lastLoginAt: new Date(),
    },
  })
  await ensureCustomerCode(customer)
  return { token: signCustomerToken(customer), customer }
}

export async function loginWithPassword(
  rawPhone: string,
  password: string,
): Promise<{ token: string; customer: Customer }> {
  const phone = normalizeNigerianPhone(rawPhone)
  const customer = await prisma.customer.findFirst({ where: { phone, isActive: true } })
  if (!customer?.passwordHash) {
    throw new UnauthorizedError('No password login for this number. Use phone code instead.')
  }
  const ok = await bcrypt.compare(password, customer.passwordHash)
  if (!ok) {
    throw new UnauthorizedError('Incorrect phone number or password.')
  }
  await ensureCustomerCode(customer)
  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { lastLoginAt: new Date() },
  })
  return { token: signCustomerToken(updated), customer: updated }
}

export async function changeCustomerPassword(
  customerId: number,
  currentPassword: string | null,
  newPassword: string,
): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new NotFoundError('Account not found.')
  if (customer.passwordHash) {
    if (!currentPassword) {
      throw new UnprocessableError('Enter your current password first.')
    }
    const ok = await bcrypt.compare(currentPassword, customer.passwordHash)
    if (!ok) throw new UnauthorizedError('Current password is incorrect.')
  }
  const newHash = await bcrypt.hash(newPassword, 10)
  await prisma.customer.update({
    where: { id: customerId },
    data: { passwordHash: newHash },
  })
}

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
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new NotFoundError('Account not found.')
  if (!customer.isActive) throw new ForbiddenError('This account has been deactivated.')

  const fields: {
    fullName?: string
    phone?: string
    phoneVerified?: boolean
    email?: string | null
    avatarUrl?: string | null
    preferredBarberId?: number | null
    favoriteServiceId?: number | null
    reminderOptIn?: boolean
  } = {}

  if (patch.fullName !== undefined && patch.fullName.trim()) {
    fields.fullName = patch.fullName.trim()
  }
  if (patch.phone !== undefined && patch.phone.trim()) {
    const phone = normalizeNigerianPhone(patch.phone)
    if (!isPlausiblePhone(phone)) {
      throw new UnprocessableError('Provide a valid phone number.')
    }
    const taken = await prisma.customer.findFirst({ where: { phone } })
    if (taken && taken.id !== customer.id) {
      throw new ConflictError('This phone number is already in use by another account.')
    }
    fields.phone = phone
    fields.phoneVerified = true
  }
  if (patch.email !== undefined) {
    const email = patch.email ? patch.email.trim().toLowerCase() : null
    if (email && email !== customer.email) {
      const taken = await prisma.customer.findFirst({ where: { email } })
      if (taken) throw new ConflictError('This email is already in use by another account.')
    }
    fields.email = email
  }
  if (patch.avatarUrl !== undefined) fields.avatarUrl = patch.avatarUrl
  if (patch.preferredBarberId !== undefined) fields.preferredBarberId = patch.preferredBarberId
  if (patch.favoriteServiceId !== undefined) fields.favoriteServiceId = patch.favoriteServiceId
  if (patch.reminderOptIn !== undefined) fields.reminderOptIn = patch.reminderOptIn

  return prisma.customer.update({
    where: { id: customerId },
    data: fields,
  })
}

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
    phoneVerified: customer.phoneVerified,
    hasGoogleAccount: Boolean(customer.googleSub),
    createdAt: customer.createdAt,
    lastLoginAt: customer.lastLoginAt,
  }
}
