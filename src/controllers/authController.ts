import type { Request, Response, NextFunction } from 'express'
import {
  loginAdmin,
  getMe,
  changeAdminPassword,
  updateAdminProfile,
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPasswordWithOtp,
} from '../services/authService'
import { successRes } from '../utils/response'
import { uploadImageToCloudinary, deleteImageByUrl } from '../utils/upload'
import type {
  LoginInput,
  ChangePasswordInput,
  UpdateAdminProfileInput,
  ForgotPasswordRequestInput,
  ForgotPasswordVerifyInput,
  ForgotPasswordResetInput,
} from '../validators/auth'

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

export async function updateProfileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let avatarUrl = req.body.avatarUrl as string | undefined
    if (req.file) {
      const current = await getMe(req.admin!.id)
      const uploaded = await uploadImageToCloudinary(req.file.buffer, 'sawaba-admins', req.file.mimetype)
      avatarUrl = uploaded.url
      if (current.avatarUrl && current.avatarUrl !== avatarUrl) {
        await deleteImageByUrl(current.avatarUrl).catch(() => undefined)
      }
    }

    const input: UpdateAdminProfileInput = {
      ...(req.body.name ? { name: String(req.body.name).trim() } : {}),
      ...(req.body.email ? { email: String(req.body.email).trim().toLowerCase() } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    }

    const admin = await updateAdminProfile(req.admin!.id, input)
    successRes(res, 'Admin profile updated successfully.', { admin }, 200)
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

export async function requestPasswordResetHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, target } = req.body as ForgotPasswordRequestInput
    const result = await requestPasswordReset(email, target)
    successRes(res, result.message, {}, 200)
  } catch (error) {
    next(error)
  }
}

export async function verifyPasswordResetHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, code, target } = req.body as ForgotPasswordVerifyInput
    const result = await verifyPasswordResetOtp(email, code, target)
    successRes(res, 'Verification code confirmed.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, resetToken, newPassword, target } = req.body as ForgotPasswordResetInput
    await resetPasswordWithOtp(email, resetToken, newPassword, target)
    successRes(res, 'Password has been reset successfully. You can now sign in with your new password.', {}, 200)
  } catch (error) {
    next(error)
  }
}