import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../config/database'
import type { Admin } from '@prisma/client'
import { UnauthorizedError, AppError, NotFoundError, UnprocessableError, ConflictError } from '../utils/errors'
import { sendEmail, isValidRecipient } from './mailer'
import { isSmsConfigured, sendSms } from './smsService'
import { normalizeNigerianPhone, toE164 } from '../utils/phone'
import {
  generateOtp,
  hashOtp,
  signResetToken,
  verifyResetToken,
  OTP_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  RESET_TOKEN_TTL_SECONDS,
  MAX_OTP_ATTEMPTS,
  type ResetTokenPayload,
} from './otpService'
import type { LoginInput, PasswordResetTarget } from '../validators/auth'

export interface AdminPublic {
  id: number
  name: string
  email: string
  role: string
  avatarUrl: string | null
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export function serializeAdmin(admin: Admin): AdminPublic {
  const { id, name, email, role, avatarUrl, isActive, createdAt, updatedAt } = admin
  return { id, name, email, role, avatarUrl: avatarUrl ?? null, isActive, createdAt, updatedAt }
}

export async function loginAdmin(input: LoginInput): Promise<{ token: string; admin: AdminPublic }> {
  const admin = await prisma.admin.findUnique({ where: { email: input.email } })
  if (!admin) {
    throw new UnauthorizedError('Invalid email or password.')
  }
  if (!admin.isActive) {
    throw new UnauthorizedError('This account has been deactivated. Contact support.')
  }

  const match = await bcrypt.compare(input.password, admin.password)
  if (!match) {
    throw new UnauthorizedError('Invalid email or password.')
  }

  const token = jwt.sign(
    { sub: admin.id, email: admin.email, name: admin.name, role: admin.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  )

  return { token, admin: serializeAdmin(admin) }
}

export async function getMe(adminId: number): Promise<AdminPublic> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } })
  if (!admin) {
    throw new UnauthorizedError('Account no longer exists.')
  }
  return serializeAdmin(admin)
}

export async function updateAdminProfile(
  adminId: number,
  input: { name?: string; email?: string; avatarUrl?: string | null },
): Promise<AdminPublic> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } })
  if (!admin) {
    throw new UnauthorizedError('Account no longer exists.')
  }

  if (input.email && input.email !== admin.email) {
    const existing = await prisma.admin.findUnique({ where: { email: input.email } })
    if (existing && existing.id !== adminId) {
      throw new ConflictError('Another administrator is already using this email address.')
    }
  }

  const updated = await prisma.admin.update({
    where: { id: adminId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    },
  })

  return serializeAdmin(updated)
}

export async function changeAdminPassword(
  adminId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } })
  if (!admin) {
    throw new UnauthorizedError('Account no longer exists.')
  }

  const match = await bcrypt.compare(currentPassword, admin.password)
  if (!match) {
    throw new AppError('Current password is incorrect.', 400)
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12)
  await prisma.admin.update({
    where: { id: adminId },
    data: { password: hashedPassword },
  })
}

/**
 * Forgot Password — password_reset_otps backs ADMIN, BARBER and CUSTOMER.
 *
 * request  → the code is ONLY ever delivered (email or SMS); never returned.
 * verify   → checks the code, CONSUMES it (single use) and returns a short-lived
 *            reset token that authorises the reset step.
 * reset    → trusts the reset token, writes the new bcrypt hash, then expires
 *            every outstanding code for that account.
 *
 * The messages returned by `request` are intentionally generic: they never
 * confirm that an account exists, so the endpoint can't be used to harvest
 * registered email addresses.
 */

const RESET_GENERIC_MESSAGE =
  'If an account exists for this email, a 6-digit reset code has been sent to it. It expires in ' +
  `${OTP_TTL_MINUTES} minutes and is for one-time use.`

interface ResetAccount {
  id: number
  name: string
  email: string | null
  phone: string | null
}

async function findForPasswordReset(email: string, target: PasswordResetTarget): Promise<ResetAccount | null> {
  if (target === 'ADMIN') {
    const admin = await prisma.admin.findUnique({ where: { email } })
    if (!admin || !admin.isActive) return null
    return { id: admin.id, name: admin.name, email: admin.email, phone: null }
  }
  if (target === 'BARBER') {
    const barber = await prisma.barber.findFirst({ where: { email } })
    if (!barber || !barber.isActive) return null
    return { id: barber.id, name: barber.name, email: barber.email, phone: barber.phone }
  }
  const customer = await prisma.customer.findFirst({ where: { email } })
  if (!customer || !customer.isActive) return null
  return { id: customer.id, name: customer.fullName, email: customer.email, phone: customer.phone }
}

/** Sends an OTP to the account via email, falling back to SMS when email is absent. */
async function deliverResetOtp(account: ResetAccount, code: string): Promise<boolean> {
  let delivered = false

  if (account.email && isValidRecipient(account.email)) {
    try {
      await sendEmail({
        to: account.email,
        subject: 'SAWABA — Password Reset Verification Code',
        text: `Hello ${account.name},\n\nYour 6-digit password reset verification code is: ${code}\n\nThis code will expire in ${OTP_TTL_MINUTES} minutes and can only be used once. If you did not request a password reset, please ignore this email or contact support.\n\n— SAWABA Grooming Studio`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;border:1px solid #2a2a32;border-radius:12px;background:#0d0d12;color:#f3f4f6;">
            <h2 style="color:#c9a24b;margin-top:0;">Password Reset Code</h2>
            <p style="color:#9ca3af;font-size:14px;">Use the verification code below to reset your password. It will expire in ${OTP_TTL_MINUTES} minutes and can only be used once.</p>
            <div style="margin:24px 0;text-align:center;">
              <span style="display:inline-block;padding:12px 24px;background:#181820;border:1px solid #c9a24b;border-radius:8px;font-size:28px;font-family:monospace;letter-spacing:6px;font-weight:bold;color:#facc15;">
                ${code}
              </span>
            </div>
            <p style="color:#6b7280;font-size:12px;">If you did not request this, you can safely ignore this message.</p>
          </div>
        `,
      })
      delivered = true
    } catch (mailErr) {
      console.warn('[authService] reset code email failed:', (mailErr as Error).message)
    }
  }

  if (!delivered && isSmsConfigured() && account.phone) {
    const e164 = toE164(normalizeNigerianPhone(account.phone))
    if (e164) {
      try {
        await sendSms(
          e164,
          `Your SAWABA password reset code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes and is for one-time use.`,
        )
        delivered = true
      } catch (smsErr) {
        console.warn('[authService] reset code SMS failed:', (smsErr as Error).message)
      }
    }
  }

  return delivered
}

/**
 * Step 1 — request a reset code. Always returns HTTP 200 with a generic
 * message; never reveals whether the account exists and never returns the code.
 */
export async function requestPasswordReset(
  email: string,
  target: PasswordResetTarget = 'ADMIN',
): Promise<{ message: string }> {
  const account = await findForPasswordReset(email, target)
  if (!account) {
    return { message: RESET_GENERIC_MESSAGE }
  }

  // Resend cooldown: refuse a new code while an unexpired one was just issued.
  const live = await prisma.passwordResetOtp.findFirst({
    where: { email, target, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  if (live) {
    const waited = (Date.now() - live.createdAt.getTime()) / 1000
    if (waited < RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - waited)
      throw new AppError(`Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another code.`, 429)
    }
  }

  const code = generateOtp()
  const scope = `${target.toLowerCase()}:${email}`
  const codeHash = hashOtp(code, scope)

  // Invalidating older active codes keeps exactly one usable code per account.
  await prisma.passwordResetOtp.updateMany({
    where: { email, target, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  await prisma.passwordResetOtp.create({
    data: {
      email,
      target,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  })

  const delivered = await deliverResetOtp(account, code)

  if (!delivered) {
    // Nothing was actually sent — discard the code so no zombie row lingers.
    await prisma.passwordResetOtp.updateMany({
      where: { email, target, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    return { message: RESET_GENERIC_MESSAGE }
  }

  return {
    message: `A 6-digit reset code has been sent to ${account.email ? `your email (${account.email})` : 'your phone'}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  }
}

/**
 * Step 2 — verify the code. On success the code is consumed (single use) and
 * a short-lived reset token is returned in exchange. The code never comes back.
 */
export async function verifyPasswordResetOtp(
  email: string,
  code: string,
  target: PasswordResetTarget = 'ADMIN',
): Promise<{ resetToken: string; expiresInSeconds: number }> {
  const otp = await prisma.passwordResetOtp.findFirst({
    where: {
      email,
      target,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!otp) {
    throw new UnprocessableError('This code is invalid or has expired. Please request a new code.')
  }

  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    await prisma.passwordResetOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    })
    throw new UnprocessableError('Too many incorrect attempts with this code. Please request a new code.')
  }

  const scope = `${target.toLowerCase()}:${email}`
  if (hashOtp(code.trim(), scope) !== otp.codeHash) {
    await prisma.passwordResetOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    })
    throw new UnprocessableError('Incorrect verification code. Please try again.')
  }

  // Single use: consume the code the moment it is correctly verified.
  const consumed = await prisma.passwordResetOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  })

  const account = await findForPasswordReset(email, target)
  if (!account) {
    throw new UnprocessableError('This account is no longer available. Please contact support.')
  }

  const payload = {
    sub: account.id,
    email,
    target,
    otpId: consumed.id,
    purpose: 'password_reset' as const,
  }
  return { resetToken: signResetToken(payload), expiresInSeconds: RESET_TOKEN_TTL_SECONDS }
}

/**
 * Step 3 — reset the password. Authorised by the reset token (never the code),
 * writes a fresh bcrypt hash and invalidates every outstanding code for the
 * account so a stolen code can't be used after the reset.
 */
export async function resetPasswordWithOtp(
  email: string,
  resetToken: string,
  newPassword: string,
  target: PasswordResetTarget = 'ADMIN',
): Promise<void> {
  const payload = verifyResetToken(resetToken) as ResetTokenPayload
  if (payload.purpose !== 'password_reset' || payload.email !== email || payload.target !== target) {
    throw new UnprocessableError('This reset session is invalid for this account.')
  }

  const account = await findForPasswordReset(email, target)
  if (!account) {
    throw new NotFoundError('This account no longer exists. Please contact support.')
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12)

  if (target === 'ADMIN') {
    await prisma.admin.update({ where: { id: account.id }, data: { password: hashedPassword } })
  } else if (target === 'BARBER') {
    await prisma.barber.update({ where: { id: account.id }, data: { passwordHash: hashedPassword } })
  } else {
    await prisma.customer.update({ where: { id: account.id }, data: { passwordHash: hashedPassword } })
  }

  // Every other outstanding code dies with the reset.
  await prisma.passwordResetOtp.updateMany({
    where: { email, target, consumedAt: null },
    data: { consumedAt: new Date() },
  })
}