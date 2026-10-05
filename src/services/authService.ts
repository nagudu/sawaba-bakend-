import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { Admin } from '../models'
import { UnauthorizedError, AppError } from '../utils/errors'
import type { LoginInput } from '../validators/auth'

export interface AdminPublic {
  id: number
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export function serializeAdmin(admin: Admin): AdminPublic {
  const { id, name, email, role, isActive, createdAt, updatedAt } = admin
  return { id, name, email, role, isActive, createdAt, updatedAt }
}

export async function loginAdmin(input: LoginInput): Promise<{ token: string; admin: AdminPublic }> {
  const admin = await Admin.findOne({ where: { email: input.email } })
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
  const admin = await Admin.findByPk(adminId)
  if (!admin) {
    throw new UnauthorizedError('Account no longer exists.')
  }
  return serializeAdmin(admin)
}

export async function changeAdminPassword(
  adminId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const admin = await Admin.findByPk(adminId)
  if (!admin) {
    throw new UnauthorizedError('Account no longer exists.')
  }

  const match = await bcrypt.compare(currentPassword, admin.password)
  if (!match) {
    throw new AppError('Current password is incorrect.', 400)
  }

  admin.password = await bcrypt.hash(newPassword, 12)
  await admin.save()
}