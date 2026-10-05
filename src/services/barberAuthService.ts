import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../config/database'
import type { Barber } from '@prisma/client'
import { AppError, UnauthorizedError } from '../utils/errors'
import { serializeBarberForAdmin } from './barberService'
import type { BarberAdmin } from './barberService'
import type { BarberLoginInput, BarberChangePasswordInput } from '../validators/barberAuth'

export interface BarberSession {
  token: string
  barber: BarberAdmin
}

function signToken(barber: Barber): string {
  return jwt.sign(
    { sub: barber.id, email: barber.email ?? '', name: barber.name, role: 'BARBER' },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  )
}

export async function loginBarber(input: BarberLoginInput): Promise<BarberSession> {
  const identifier = input.identifier.trim().toLowerCase()
  const byEmail = identifier.includes('@')

  const barber = await prisma.barber.findFirst({
    where: byEmail ? { email: identifier } : { phone: identifier },
  })

  if (!barber || !barber.passwordHash) {
    throw new UnauthorizedError('Invalid login details.')
  }
  if (!barber.isActive) {
    throw new UnauthorizedError('This barber account has been deactivated.')
  }
  if (!barber.portalEnabled) {
    throw new UnauthorizedError('Portal access is not enabled for this account yet.')
  }

  const matches = await bcrypt.compare(input.password, barber.passwordHash)
  if (!matches) {
    throw new UnauthorizedError('Invalid login details.')
  }

  return { token: signToken(barber), barber: serializeBarberForAdmin(barber) }
}

export async function getBarberMe(barberId: number): Promise<BarberAdmin> {
  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      barberServices: {
        include: { service: true },
      },
    },
  })
  if (!barber) {
    throw new UnauthorizedError('Barber account no longer exists.')
  }
  return serializeBarberForAdmin(barber, true)
}

export async function changeBarberPassword(
  barberId: number,
  input: BarberChangePasswordInput,
): Promise<void> {
  const barber = await prisma.barber.findUnique({ where: { id: barberId } })
  if (!barber) {
    throw new UnauthorizedError('Barber account no longer exists.')
  }

  const matches = await bcrypt.compare(input.currentPassword, barber.passwordHash ?? '')
  if (!matches) {
    throw new AppError('Current password is incorrect.', 400)
  }

  const newHash = await bcrypt.hash(input.newPassword, 12)
  await prisma.barber.update({
    where: { id: barberId },
    data: { passwordHash: newHash },
  })
}