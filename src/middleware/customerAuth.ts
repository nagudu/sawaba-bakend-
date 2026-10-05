import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../config/database'
import type { Customer } from '@prisma/client'
import { ForbiddenError, UnauthorizedError } from '../utils/errors'

export interface CustomerAuthPayload {
  sub: number
  phone: string
  name: string
  role: 'CUSTOMER'
  iat?: number
  exp?: number
}

declare module 'express-serve-static-core' {
  interface Request {
    customer?: Customer
  }
}

export async function requireCustomer(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Please login to continue.')
    }

    let payload: CustomerAuthPayload
    try {
      payload = jwt.verify(authHeader.slice(7), env.jwtSecret) as unknown as CustomerAuthPayload
    } catch {
      throw new UnauthorizedError('Your session has expired. Please login again.')
    }

    if (payload.role !== 'CUSTOMER') {
      throw new UnauthorizedError('This area requires a customer account.')
    }

    const customer = await prisma.customer.findUnique({ where: { id: payload.sub } })
    if (!customer || !customer.isActive) {
      throw new UnauthorizedError('Account no longer exists or has been deactivated.')
    }

    req.customer = customer
    next()
  } catch (error) {
    next(error)
  }
}

export async function attachCustomerIfPresent(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const payload = jwt.verify(authHeader.slice(7), env.jwtSecret) as unknown as CustomerAuthPayload
      if (payload.role === 'CUSTOMER') {
        const customer = await prisma.customer.findUnique({ where: { id: payload.sub } })
        if (customer?.isActive) req.customer = customer
      }
    }
  } catch {
    // Invalid/expired token on an optional route: treat as guest.
  }
  next()
}

export function assertCustomerActive(customer: Customer): void {
  if (!customer.isActive) {
    throw new ForbiddenError('This account has been deactivated. Please contact the salon.')
  }
}
