import type { NextFunction, Request, Response } from 'express'
import {
  changeBarberPassword,
  getBarberMe,
  loginBarber,
} from '../services/barberAuthService'
import { successRes } from '../utils/response'

/** Errors must reach the central error middleware via next() — throwing in an
 *  async handler crashes the process instead of returning a 4xx. */
export async function loginBarberController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await loginBarber(req.body)
    successRes(res, 'Login successful.', session, 200)
  } catch (error) {
    next(error)
  }
}

export async function getBarberMeController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const barber = await getBarberMe(req.barber!.id)
    successRes(res, 'Barber profile fetched.', { barber }, 200)
  } catch (error) {
    next(error)
  }
}

export async function changeBarberPasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await changeBarberPassword(req.barber!.id, req.body)
    successRes(res, 'Password updated.', undefined, 200)
  } catch (error) {
    next(error)
  }
}