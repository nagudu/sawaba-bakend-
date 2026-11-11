import { Prisma } from '@prisma/client'
import type { NotificationChannel } from '@prisma/client'
import { prisma } from '../config/database'
import { sendCustomerNotification, type NotificationCustomer } from './notificationService'
import { isEmailConfigured } from './mailer'
import { isSmsConfigured } from './smsService'
import { isWhatsAppConfigured } from './whatsappService'
import { encryptSecret, secretState, isEncryptionConfigured } from '../utils/secrets'
import {
  invalidateNotificationConfig,
  loadNotificationConfig,
  normalizeEventChannels,
} from './notificationConfigService'

/** Encrypts a new secret, clears it (null/empty), or leaves it untouched (undefined). */
function encryptOrClear(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return encryptSecret(trimmed)
}

function eventChannelsInput(
  value: Record<string, string[]> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined
  if (value === null) return Prisma.DbNull
  return value as Prisma.InputJsonValue
}

/** Masks an email/phone for admin history views (never exposes the full value). */
function maskRecipient(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.includes('@')) {
    const [local, domain] = value.split('@')
    return `${local.slice(0, 2)}***@${domain}`
  }
  return value.length > 4 ? `${value.slice(0, 3)}***${value.slice(-2)}` : '***'
}

/** Admin-safe view of the notification settings (secret VALUES are never returned). */
export async function getNotificationSettingsAdmin(): Promise<Record<string, unknown>> {
  // Refresh so the "configured" flags reflect what is actually saved.
  await loadNotificationConfig(true)
  const row = await prisma.notificationSetting.findFirst({ orderBy: { id: 'asc' } })

  const smsKey = secretState(row?.smsApiKey)
  const waToken = secretState(row?.whatsappToken)
  const emailKey = secretState(row?.emailApiKey)
  const smtpPass = secretState(row?.smtpPassword)

  return {
    emailEnabled: row?.emailEnabled ?? true,
    smsEnabled: row?.smsEnabled ?? false,
    whatsappEnabled: row?.whatsappEnabled ?? false,
    smsProvider: row?.smsProvider ?? 'termii',
    smsSenderId: row?.smsSenderId ?? null,
    smsBaseUrl: row?.smsBaseUrl ?? null,
    hasSmsApiKey: smsKey.set,
    smsApiKeyLast4: smsKey.last4,
    whatsappPhoneNumberId: row?.whatsappPhoneNumberId ?? null,
    whatsappDisplayNumber: row?.whatsappDisplayNumber ?? null,
    whatsappApiVersion: row?.whatsappApiVersion ?? null,
    hasWhatsappToken: waToken.set,
    whatsappTokenLast4: waToken.last4,
    emailProvider: row?.emailProvider ?? 'resend',
    fromEmail: row?.fromEmail ?? null,
    hasEmailApiKey: emailKey.set,
    emailApiKeyLast4: emailKey.last4,
    smtpHost: row?.smtpHost ?? null,
    smtpPort: row?.smtpPort ?? null,
    smtpUser: row?.smtpUser ?? null,
    smtpSecure: row?.smtpSecure ?? false,
    hasSmtpPassword: smtpPass.set,
    smtpPasswordLast4: smtpPass.last4,
    eventChannels: normalizeEventChannels(row?.eventChannels),
    isEmailConfigured: isEmailConfigured(),
    isSmsConfigured: isSmsConfigured(),
    isWhatsAppConfigured: isWhatsAppConfigured(),
    isEncryptionConfigured: isEncryptionConfigured(),
    updatedAt: row?.updatedAt ?? null,
  }
}

export interface UpdateNotificationSettingsInput {
  emailEnabled?: boolean
  smsEnabled?: boolean
  whatsappEnabled?: boolean
  smsProvider?: string
  smsApiKey?: string | null
  smsSenderId?: string | null
  smsBaseUrl?: string | null
  whatsappPhoneNumberId?: string | null
  whatsappToken?: string | null
  whatsappDisplayNumber?: string | null
  whatsappApiVersion?: string | null
  emailProvider?: string
  emailApiKey?: string | null
  fromEmail?: string | null
  smtpHost?: string | null
  smtpPort?: number | null
  smtpUser?: string | null
  smtpPassword?: string | null
  smtpSecure?: boolean
  eventChannels?: Record<string, string[]> | null
}

export async function updateNotificationSettingsAdmin(
  input: UpdateNotificationSettingsInput,
): Promise<Record<string, unknown>> {
  const existing = await prisma.notificationSetting.findFirst({ orderBy: { id: 'asc' } })

  const nextSmsApiKey = encryptOrClear(input.smsApiKey)
  const nextWaToken = encryptOrClear(input.whatsappToken)
  const nextEmailKey = encryptOrClear(input.emailApiKey)
  const nextSmtpPassword = encryptOrClear(input.smtpPassword)
  const nextEventChannels = eventChannelsInput(input.eventChannels)

  await prisma.notificationSetting.upsert({
    where: { id: existing?.id ?? 1 },
    create: {
      id: 1,
      emailEnabled: input.emailEnabled ?? true,
      smsEnabled: input.smsEnabled ?? false,
      whatsappEnabled: input.whatsappEnabled ?? false,
      smsProvider: input.smsProvider ?? 'termii',
      smsApiKey: nextSmsApiKey ?? null,
      smsSenderId: input.smsSenderId ?? null,
      smsBaseUrl: input.smsBaseUrl ?? null,
      whatsappPhoneNumberId: input.whatsappPhoneNumberId ?? null,
      whatsappToken: nextWaToken ?? null,
      whatsappDisplayNumber: input.whatsappDisplayNumber ?? null,
      whatsappApiVersion: input.whatsappApiVersion ?? null,
      emailProvider: input.emailProvider ?? 'resend',
      emailApiKey: nextEmailKey ?? null,
      fromEmail: input.fromEmail ?? null,
      smtpHost: input.smtpHost ?? null,
      smtpPort: input.smtpPort ?? null,
      smtpUser: input.smtpUser ?? null,
      smtpPassword: nextSmtpPassword ?? null,
      smtpSecure: input.smtpSecure ?? false,
      ...(nextEventChannels !== undefined && nextEventChannels !== Prisma.DbNull
        ? { eventChannels: nextEventChannels }
        : {}),
    },
    update: {
      ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
      ...(input.smsEnabled !== undefined ? { smsEnabled: input.smsEnabled } : {}),
      ...(input.whatsappEnabled !== undefined ? { whatsappEnabled: input.whatsappEnabled } : {}),
      ...(input.smsProvider !== undefined ? { smsProvider: input.smsProvider } : {}),
      ...(nextSmsApiKey !== undefined ? { smsApiKey: nextSmsApiKey } : {}),
      ...(input.smsSenderId !== undefined ? { smsSenderId: input.smsSenderId } : {}),
      ...(input.smsBaseUrl !== undefined ? { smsBaseUrl: input.smsBaseUrl } : {}),
      ...(input.whatsappPhoneNumberId !== undefined ? { whatsappPhoneNumberId: input.whatsappPhoneNumberId } : {}),
      ...(nextWaToken !== undefined ? { whatsappToken: nextWaToken } : {}),
      ...(input.whatsappDisplayNumber !== undefined ? { whatsappDisplayNumber: input.whatsappDisplayNumber } : {}),
      ...(input.whatsappApiVersion !== undefined ? { whatsappApiVersion: input.whatsappApiVersion } : {}),
      ...(input.emailProvider !== undefined ? { emailProvider: input.emailProvider } : {}),
      ...(nextEmailKey !== undefined ? { emailApiKey: nextEmailKey } : {}),
      ...(input.fromEmail !== undefined ? { fromEmail: input.fromEmail } : {}),
      ...(input.smtpHost !== undefined ? { smtpHost: input.smtpHost } : {}),
      ...(input.smtpPort !== undefined ? { smtpPort: input.smtpPort } : {}),
      ...(input.smtpUser !== undefined ? { smtpUser: input.smtpUser } : {}),
      ...(nextSmtpPassword !== undefined ? { smtpPassword: nextSmtpPassword } : {}),
      ...(input.smtpSecure !== undefined ? { smtpSecure: input.smtpSecure } : {}),
      ...(nextEventChannels !== undefined ? { eventChannels: nextEventChannels } : {}),
    },
  })

  // New credentials must take effect immediately, not after the cache TTL.
  invalidateNotificationConfig()
  return getNotificationSettingsAdmin()
}

export async function listNotificationTemplates(): Promise<Record<string, unknown>[]> {
  const rows = await prisma.notificationTemplate.findMany({ orderBy: { updatedAt: 'desc' } })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    event: row.event,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
  }))
}

export async function upsertNotificationTemplate(input: {
  name: string
  event: string
  channel: NotificationChannel
  subject: string
  body: string
  isActive?: boolean
}): Promise<void> {
  const existing = await prisma.notificationTemplate.findUnique({ where: { name: input.name } })
  if (existing) {
    await prisma.notificationTemplate.update({
      where: { id: existing.id },
      data: {
        event: input.event as never,
        channel: input.channel,
        subject: input.subject,
        body: input.body,
        isActive: input.isActive ?? existing.isActive,
      },
    })
    return
  }
  await prisma.notificationTemplate.create({
    data: {
      name: input.name,
      event: input.event as never,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      isActive: input.isActive ?? true,
    },
  })
}

export async function listCustomerNotifications(query: {
  status?: string
  channel?: string
  event?: string
  customerId?: number
  page?: number
  perPage?: number
}): Promise<{ items: Record<string, unknown>[]; total: number; page: number; perPage: number }> {
  const page = query.page ?? 1
  const perPage = query.perPage ?? 20
  const where: Prisma.CustomerNotificationWhereInput = {}
  if (query.status) where.status = query.status as never
  if (query.channel) where.channel = query.channel as never
  if (query.event) where.type = query.event as never
  if (query.customerId) where.customerId = query.customerId

  const [rows, total] = await Promise.all([
    prisma.customerNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { customer: { select: { id: true, fullName: true, phone: true, email: true } } },
    }),
    prisma.customerNotification.count({ where }),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customer: row.customer,
      appointmentId: row.appointmentId,
      orderId: row.orderId,
      type: row.type,
      channel: row.channel,
      title: row.title,
      message: row.message,
      recipient: maskRecipient(row.recipient),
      status: row.status,
      provider: row.provider,
      providerMessageId: row.providerMessageId,
      error: row.error,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
    })),
    total,
    page,
    perPage,
  }
}

export async function sendTestNotification(input: {
  channel: NotificationChannel
  customerId?: number | null
}): Promise<{ ok: boolean; status?: string }> {
  const customer = input.customerId
    ? await prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, fullName: true, phone: true, email: true },
      })
    : null
  const target: NotificationCustomer = customer
    ? { id: customer.id, fullName: customer.fullName, phone: customer.phone, email: customer.email }
    : {
        fullName: 'Admin',
        phone: process.env.ADMIN_NOTIFICATION_PHONE ?? undefined,
        email: process.env.ADMIN_NOTIFICATION_EMAIL ?? null,
      }

  const result = await sendCustomerNotification({
    event: 'TEST',
    customer: target,
    channels: [input.channel],
    dedupeKey: `test:${input.channel}:${Date.now()}`,
  })
  return { ok: true, status: result.status }
}
