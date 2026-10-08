import { z } from 'zod'

/** Account types that have a password-reset flow. */
export const passwordResetTargets = ['ADMIN', 'BARBER', 'CUSTOMER'] as const
export type PasswordResetTarget = (typeof passwordResetTargets)[number]

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required.' })
    .trim()
    .toLowerCase()
    .email('Provide a valid email address.'),
  password: z
    .string({ required_error: 'Password is required.' })
    .min(1, 'Password is required.'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters.')
    .regex(/[A-Za-z]/, 'New password must contain a letter.')
    .regex(/\d/, 'New password must contain a number.'),
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const createAdminSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  email: z.string().trim().toLowerCase().email('Provide a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/\d/, 'Password must contain a number.'),
  role: z.enum(['ADMIN']).default('ADMIN'),
})

export type CreateAdminInput = z.infer<typeof createAdminSchema>

export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email('Provide a valid email address.'),
  target: z.enum(passwordResetTargets).optional().default('ADMIN'),
})

export type ForgotPasswordRequestInput = z.infer<typeof forgotPasswordRequestSchema>

export const forgotPasswordVerifySchema = z.object({
  email: z.string().trim().toLowerCase().email('Provide a valid email address.'),
  code: z.string().trim().length(6, 'Verification code must be 6 digits.'),
  target: z.enum(passwordResetTargets).optional().default('ADMIN'),
})

export type ForgotPasswordVerifyInput = z.infer<typeof forgotPasswordVerifySchema>

export const forgotPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email('Provide a valid email address.'),
  resetToken: z
    .string({ required_error: 'Reset token is required.' })
    .trim()
    .min(1, 'Reset token is required.'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters.')
    .regex(/[A-Za-z]/, 'New password must contain a letter.')
    .regex(/\d/, 'New password must contain a number.'),
  target: z.enum(passwordResetTargets).optional().default('ADMIN'),
})

export type ForgotPasswordResetInput = z.infer<typeof forgotPasswordResetSchema>

export const updateAdminProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100).optional(),
  email: z.string().trim().toLowerCase().email('Provide a valid email address.').optional(),
  avatarUrl: z.string().trim().optional().nullable(),
})

export type UpdateAdminProfileInput = z.infer<typeof updateAdminProfileSchema>