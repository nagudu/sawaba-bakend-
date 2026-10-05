import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { Admin } from '../models'
import { ForbiddenError, UnauthorizedError } from '../utils/errors'
import type { Role } from '../types'

export interface AuthPayload {
  sub: number
  email: string
  name: string
  role: Role
  iat?: number
  exp?: number
}

declare module 'express-serve-static-core' {
  interface Request {
    admin?: Admin
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
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

    const admin = await Admin.findByPk(payload.sub)
    if (!admin || !admin.isActive) {
      throw new UnauthorizedError('Account no longer exists or has been deactivated.')
    }

    req.admin = admin
    next()
  } catch (error) {
    next(error)
  }
}

export function requireRole(...roles: Role[]): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const admin = req.admin
    if (!admin) {
      next(new UnauthorizedError('Authentication required.'))
      return
    }
    if (!roles.includes(admin.role)) {
      next(new ForbiddenError('You do not have permission to perform this action.'))
      return
    }
    next()
  }
}