import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { Barber } from '../models'
import { AppError, UnauthorizedError } from '../utils/errors'
import { serializeBarberForAdmin } from './barberService'
import type { BarberAdmin } from './barberService'
import type { BarberLoginInput, BarberChangePasswordInput } from '../validators/barberAuth'

export interface BarberSession {
  token: string
  barber: BarberAdmin
}

/**
 * Issues a barber-portal JWT. Roles are explicitly checked by requireBarber,
 * so a barber token can never be used to hit admin endpoints and vice-versa.
 */
function signToken(barber: Barber): string {
  return jwt.sign(
    { sub: barber.id, email: barber.email ?? '', name: barber.name, role: 'BARBER' },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  )
}

/** Signs in a barber using their email OR phone and the admin-issued password. */
export async function loginBarber(input: BarberLoginInput): Promise<BarberSession> {
  const identifier = input.identifier.trim().toLowerCase()
  const byEmail = identifier.includes('@')

  const barber = await Barber.findOne({
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

/** Returns the scoped, portal-safe profile of the authenticated barber. */
export async function getBarberMe(barberId: number): Promise<BarberAdmin> {
  const barber = await Barber.findByPk(barberId)
  if (!barber) {
    throw new UnauthorizedError('Barber account no longer exists.')
  }
  return serializeBarberForAdmin(barber)
}

/** Allows a barber to rotate their own portal password. */
export async function changeBarberPassword(
  barberId: number,
  input: BarberChangePasswordInput,
): Promise<void> {
  const barber = await Barber.findByPk(barberId)
  if (!barber) {
    throw new UnauthorizedError('Barber account no longer exists.')
  }

  const matches = await bcrypt.compare(input.currentPassword, barber.passwordHash ?? '')
  if (!matches) {
    throw new AppError('Current password is incorrect.', 400)
  }

  barber.passwordHash = await bcrypt.hash(input.newPassword, 12)
  await barber.save()
}