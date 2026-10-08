import type { NextFunction, Request, Response } from 'express'
import {
  changeBarberPassword,
  getBarberMe,
  loginBarber,
} from '../services/barberAuthService'
import {
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPasswordWithOtp,
} from '../services/authService'
import { successRes } from '../utils/response'
import type {
  ForgotPasswordRequestInput,
  ForgotPasswordVerifyInput,
  ForgotPasswordResetInput,
} from '../validators/auth'

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

export async function requestBarberPasswordResetController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body as ForgotPasswordRequestInput
    const result = await requestPasswordReset(email, 'BARBER')
    successRes(res, result.message, {}, 200)
  } catch (error) {
    next(error)
  }
}

export async function verifyBarberPasswordResetController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, code } = req.body as ForgotPasswordVerifyInput
    const result = await verifyPasswordResetOtp(email, code, 'BARBER')
    successRes(res, 'Verification code confirmed.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function resetBarberPasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, resetToken, newPassword } = req.body as ForgotPasswordResetInput
    await resetPasswordWithOtp(email, resetToken, newPassword, 'BARBER')
    successRes(res, 'Password has been reset successfully. You can now sign in with your new password.', {}, 200)
  } catch (error) {
    next(error)
  }
}