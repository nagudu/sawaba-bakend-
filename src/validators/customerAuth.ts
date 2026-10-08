import { z } from 'zod'

const phone = z
  .string({ required_error: 'Phone number is required.' })
  .trim()
  .min(10, 'Provide a valid phone number.')
  .max(20, 'Provide a valid phone number.')

export const customerOtpRequestSchema = z.object({ phone })

export const customerOtpVerifySchema = z.object({
  phone,
  code: z
    .string({ required_error: 'Enter the 6-digit code.' })
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
})

export const customerRegisterSchema = z.object({
  fullName: z
    .string({ required_error: 'Full name is required.' })
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(150),
  phone,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Provide a valid email address.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/\d/, 'Password must contain a number.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export const customerLoginPasswordSchema = z.object({
  identifier: z
    .string({ required_error: 'Email or phone is required.' })
    .trim()
    .min(3, 'Provide a valid email or phone number.')
    .max(255, 'Provide a valid email or phone number.'),
  password: z.string({ required_error: 'Password is required.' }).min(1, 'Password is required.'),
})

export const customerProfileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150).optional(),
    phone: phone.optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Provide a valid email address.')
      .nullable()
      .optional(),
    avatarUrl: z.string().trim().url('Provide a valid image URL.').nullable().optional(),
    preferredBarberId: z.number().int().positive().nullable().optional(),
    favoriteServiceId: z.number().int().positive().nullable().optional(),
    reminderOptIn: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' })

export const customerPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  newPassword: z
    .string({ required_error: 'New password is required.' })
    .min(8, 'New password must be at least 8 characters.')
    .regex(/[A-Za-z]/, 'New password must contain a letter.')
    .regex(/\d/, 'New password must contain a number.'),
})

export const customerCancelSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
})

/**
 * Google Identity Services hands the browser a JWT ("credential"). The body is
 * only the transport — the token is verified server-side against Google's
 * certificates before any customer is created or signed in.
 */
export const customerGoogleAuthSchema = z.object({
  credential: z
    .string({ required_error: 'Google sign-in was not completed. Please try again.' })
    .trim()
    .min(20, 'Google sign-in was not completed. Please try again.')
    .max(4096, 'Invalid Google credential.'),
})

export type CustomerOtpRequestInput = z.infer<typeof customerOtpRequestSchema>
export type CustomerOtpVerifyInput = z.infer<typeof customerOtpVerifySchema>
export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>
export type CustomerLoginPasswordInput = z.infer<typeof customerLoginPasswordSchema>
export type CustomerProfileUpdateInput = z.infer<typeof customerProfileUpdateSchema>
export type CustomerGoogleAuthInput = z.infer<typeof customerGoogleAuthSchema>
