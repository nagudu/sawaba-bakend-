import type { NextFunction, Request, Response } from 'express'
import { successRes } from '../utils/response'
import { UnauthorizedError } from '../utils/errors'
import { resolveSession } from '../services/sessionService'

/** GET /api/auth/session — identifies the role behind any role's Bearer token. */
export async function sessionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
    if (!token) throw new UnauthorizedError('Please sign in to continue.')
    const session = await resolveSession(token)
    successRes(res, 'Session resolved.', session, 200)
  } catch (error) {
    next(error)
  }
}
