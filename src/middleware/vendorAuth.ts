import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../config/database'
import type { Vendor } from '@prisma/client'
import { ForbiddenError, UnauthorizedError } from '../utils/errors'
import type { AuthPayload } from './auth'

declare module 'express-serve-static-core' {
  interface Request {
    vendor?: Vendor
  }
}

/**
 * Vendor portal authentication — a separate namespace from admin/customer so
 * tokens never cross. Vendors only ever reach data scoped to their own id;
 * authorization is enforced HERE (backend), never only in the frontend.
 */
export async function requireVendor(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token is missing or invalid.')
    }

    let payload: AuthPayload
    try {
      payload = jwt.verify(authHeader.slice(7), env.jwtSecret) as unknown as AuthPayload
    } catch {
      throw new UnauthorizedError('Access token is expired or invalid.')
    }

    if (payload.role !== ('VENDOR' as never)) {
      throw new ForbiddenError('This token is not valid for the vendor portal.')
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: payload.sub } })
    if (!vendor || !vendor.isActive) {
      throw new UnauthorizedError('Vendor account no longer exists or has been deactivated.')
    }
    if (vendor.status === 'REJECTED') {
      throw new ForbiddenError('This vendor application has been rejected.')
    }
    if (vendor.status === 'SUSPENDED') {
      throw new ForbiddenError('This vendor account has been suspended.')
    }

    req.vendor = vendor
    next()
  } catch (error) {
    next(error)
  }
}
