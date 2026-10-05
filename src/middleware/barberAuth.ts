import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { Barber } from '../models'
import { ForbiddenError, UnauthorizedError } from '../utils/errors'
import type { AuthPayload } from './auth'

declare module 'express-serve-static-core' {
  interface Request {
    barber?: Barber
  }
}

/**
 * Guards the Barber Portal API. Validates a `BARBER`-role JWT and loads the
 * barber, enforcing that their profile is active AND portal access is enabled.
 */
export async function requireBarber(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token is missing or invalid.')
    }

    const token = authHeader.slice(7)

    let payload: AuthPayload
    try {
      const decoded = jwt.verify(token, env.jwtSecret)
      payload = decoded as unknown as AuthPayload
    } catch {
      throw new UnauthorizedError('Access token is expired or invalid.')
    }

    if (payload.role !== 'BARBER') {
      throw new ForbiddenError('This token is not valid for the barber portal.')
    }

    const barber = await Barber.findByPk(payload.sub)
    if (!barber || !barber.isActive) {
      throw new UnauthorizedError('Barber account no longer exists or has been deactivated.')
    }
    if (!barber.portalEnabled || !barber.passwordHash) {
      throw new UnauthorizedError('Barber portal access is not enabled for this account.')
    }

    req.barber = barber
    next()
  } catch (error) {
    next(error)
  }
}