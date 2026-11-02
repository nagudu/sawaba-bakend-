import { z } from 'zod'

export const NOTIFICATION_EVENT_VALUES = [
  'TEST',
  'WELCOME',
  'BOOKING_CONFIRMATION',
  'BOOKING_STATUS',
  'BOOKING_REMINDER',
  'BOOKING_CANCELLED',
  'ORDER_CONFIRMATION',
  'ORDER_STATUS',
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'ORDER_CANCELLED',
  'REFUND_UPDATE',
] as const

export const NOTIFICATION_CHANNEL_VALUES = ['EMAIL', 'SMS', 'WHATSAPP'] as const

export const notificationEventSchema = z.enum(NOTIFICATION_EVENT_VALUES)
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNEL_VALUES)

export const notificationSettingsSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  // Only Termii is implemented; the enum is deliberately narrow so the admin
  // UI can never advertise a provider that has no adapter.
  smsProvider: z.enum(['termii']).optional(),
  smsApiKey: z.string().max(500).optional().nullable(),
  smsSenderId: z.string().max(40).optional().nullable(),
  smsBaseUrl: z.string().max(255).optional().nullable(),
  whatsappPhoneNumberId: z.string().max(64).optional().nullable(),
  whatsappToken: z.string().max(500).optional().nullable(),
  whatsappDisplayNumber: z.string().max(30).optional().nullable(),
  whatsappApiVersion: z.string().max(16).optional().nullable(),
  emailProvider: z.enum(['resend', 'smtp']).optional(),
  emailApiKey: z.string().max(500).optional().nullable(),
  fromEmail: z.string().email().max(255).optional().nullable(),
  smtpHost: z.string().max(255).optional().nullable(),
  smtpPort: z.union([z.coerce.number().int().min(1).max(65535), z.null()]).optional(),
  smtpUser: z.string().max(255).optional().nullable(),
  smtpPassword: z.string().max(500).optional().nullable(),
  smtpSecure: z.boolean().optional(),
  eventChannels: z.record(notificationEventSchema, notificationChannelSchema.array()).nullable().optional(),
})

export const notificationTemplateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  event: notificationEventSchema,
  channel: notificationChannelSchema,
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(4000),
  isActive: z.boolean().optional(),
})

export const notificationHistoryQuerySchema = z.object({
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'SKIPPED']).optional(),
  channel: notificationChannelSchema.optional(),
  event: notificationEventSchema.optional(),
  customerId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
})
