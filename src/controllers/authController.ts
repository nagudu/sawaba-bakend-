import type { Request, Response, NextFunction } from 'express'
import {
  loginAdmin,
  getMe,
  changeAdminPassword,
} from '../services/authService'
import { successRes } from '../utils/response'
import type { LoginInput, ChangePasswordInput } from '../validators/auth'

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as LoginInput
    const result = await loginAdmin(input)
    successRes(res, 'Login successful.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function meHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const admin = await getMe(req.admin!.id)
    successRes(res, 'Admin profile retrieved.', { admin }, 200)
  } catch (error) {
    next(error)
  }
}

export async function changePasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as ChangePasswordInput
    await changeAdminPassword(req.admin!.id, input.currentPassword, input.newPassword)
    successRes(res, 'Password updated successfully.', {}, 200)
  } catch (error) {
    next(error)
  }
}