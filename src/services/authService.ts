import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../config/database'
import type { Admin } from '@prisma/client'
import { UnauthorizedError, AppError, NotFoundError, UnprocessableError, ConflictError } from '../utils/errors'
import { sendEmail } from './mailer'
import type { LoginInput } from '../validators/auth'

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
 * Initiates the Forgot Password flow: verifies account existence, generates a 6-digit OTP,
 * hashes & stores it with 15-minute expiration, and delivers it via email.
 */
export async function requestPasswordReset(
  email: string,
  target: 'ADMIN' | 'CUSTOMER' = 'ADMIN',
): Promise<{ message: string; devCode?: string }> {
  if (target === 'ADMIN') {
    const admin = await prisma.admin.findUnique({ where: { email } })
    if (!admin) {
      throw new NotFoundError('No administrator account was found with this email address.')
    }
    if (!admin.isActive) {
      throw new UnprocessableError('This administrator account has been deactivated. Please contact support.')
    }
  } else {
    const customer = await prisma.customer.findFirst({ where: { email } })
    if (!customer) {
      throw new NotFoundError('No customer account was found with this email address.')
    }
    if (!customer.isActive) {
      throw new UnprocessableError('This customer account has been deactivated.')
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const codeHash = await bcrypt.hash(code, 10)

  // Invalidate any active, unconsumed reset codes for this email and target
  await prisma.passwordResetOtp.updateMany({
    where: { email, target, consumedAt: null },
    data: { consumedAt: new Date() },
  })

  await prisma.passwordResetOtp.create({
    data: {
      email,
      target,
      codeHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    },
  })

  let emailSent = false
  try {
    await sendEmail({
      to: email,
      subject: 'SAWABA — Password Reset Verification Code',
      text: `Hello,\n\nYour 6-digit password reset verification code is: ${code}\n\nThis code will expire in 15 minutes. If you did not request a password reset, please ignore this email or contact support.\n\n— SAWABA Grooming Studio`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;border:1px solid #2a2a32;border-radius:12px;background:#0d0d12;color:#f3f4f6;">
          <h2 style="color:#c9a24b;margin-top:0;">Password Reset Code</h2>
          <p style="color:#9ca3af;font-size:14px;">Use the verification code below to reset your password. It will expire in 15 minutes.</p>
          <div style="margin:24px 0;text-align:center;">
            <span style="display:inline-block;padding:12px 24px;background:#181820;border:1px solid #c9a24b;border-radius:8px;font-size:28px;font-family:monospace;letter-spacing:6px;font-weight:bold;color:#facc15;">
              ${code}
            </span>
          </div>
          <p style="color:#6b7280;font-size:12px;">If you did not request this, you can safely ignore this message.</p>
        </div>
      `,
    })
    emailSent = true
  } catch (mailErr) {
    console.warn('[authService] Could not send password reset email via provider:', (mailErr as Error).message)
  }

  // In non-production or if email transport is offline, provide devCode for seamless testing
  const devCode = process.env.NODE_ENV !== 'production' || !emailSent ? code : undefined

  return {
    message: emailSent
      ? 'A 6-digit verification code has been sent to your email.'
      : 'Verification code generated. (Check dev code on screen or console).',
    devCode,
  }
}

/**
 * Validates the 6-digit reset code for the specified email and target.
 */
export async function verifyPasswordResetOtp(
  email: string,
  code: string,
  target: 'ADMIN' | 'CUSTOMER' = 'ADMIN',
): Promise<{ valid: boolean }> {
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
    throw new UnprocessableError('The verification code is invalid or has expired. Please request a new code.')
  }

  if (otp.attempts >= 5) {
    throw new UnprocessableError('Too many failed attempts with this code. Please request a new code.')
  }

  const match = await bcrypt.compare(code, otp.codeHash)
  if (!match) {
    await prisma.passwordResetOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    })
    throw new UnprocessableError('Invalid verification code.')
  }

  return { valid: true }
}

/**
 * Resets the password using a verified OTP.
 */
export async function resetPasswordWithOtp(
  email: string,
  code: string,
  newPassword: string,
  target: 'ADMIN' | 'CUSTOMER' = 'ADMIN',
): Promise<void> {
  await verifyPasswordResetOtp(email, code, target)

  const hashedPassword = await bcrypt.hash(newPassword, 12)

  if (target === 'ADMIN') {
    await prisma.admin.update({
      where: { email },
      data: { password: hashedPassword },
    })
  } else {
    const customer = await prisma.customer.findFirst({ where: { email } })
    if (customer) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { passwordHash: hashedPassword },
      })
    }
  }

  // Consume all active reset codes for this account
  await prisma.passwordResetOtp.updateMany({
    where: { email, target, consumedAt: null },
    data: { consumedAt: new Date() },
  })
}