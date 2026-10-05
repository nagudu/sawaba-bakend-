import { z } from 'zod'

export const barberLoginSchema = z.object({
  identifier: z
    .string({ required_error: 'Email or phone number is required.' })
    .trim()
    .min(3, 'Enter at least 3 characters.')
    .max(150, 'Identifier must be 150 characters or less.'),
  password: z.string({ required_error: 'Password is required.' }).min(6, 'Password must be at least 6 characters.'),
})

export const barberChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
})

export type BarberLoginInput = z.infer<typeof barberLoginSchema>
export type BarberChangePasswordInput = z.infer<typeof barberChangePasswordSchema>