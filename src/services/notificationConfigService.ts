import { prisma } from '../config/database'
import type { NotificationChannel, NotificationSetting } from '@prisma/client'
import { decryptSecret } from '../utils/secrets'

/**
 * Resolves the effective notification configuration: admin-editable values from
 * the `notification_settings` singleton merged over environment variables, with
 * secrets decrypted on read. Results are cached briefly so hot paths (every
 * OTP / notification send) do not hit the DB each time; `invalidateNotificationConfig`
 * clears the cache right after an admin saves new settings.
 */

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS', 'WHATSAPP']

export interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
  secure: boolean
}

export interface ResolvedNotificationConfig {
  channels: Record<NotificationChannel, boolean>
  eventChannels: Partial<Record<string, NotificationChannel[]>> | null
  email: {
    provider: 'resend' | 'smtp'
    fromEmail: string | null
    resendApiKey: string | null
    smtp: SmtpConfig | null
  }
  sms: {
    provider: string
    apiKey: string | null
    senderId: string | null
    baseUrl: string | null
  }
  whatsapp: {
    phoneNumberId: string | null
    token: string | null
    displayNumber: string | null
    apiVersion: string
  }
}

const CACHE_TTL_MS = 30_000
let cache: ResolvedNotificationConfig | null = null
let loadedAt = 0

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function envSmtp(): SmtpConfig | null {
  const host = asString(process.env.SMTP_HOST)
  const user = asString(process.env.SMTP_USER)
  const password = process.env.SMTP_PASSWORD
  if (!host || !user || !password) return null
  const port = Number(process.env.SMTP_PORT ?? 587)
  return {
    host,
    port,
    user,
    password,
    secure: port === 465 || process.env.SMTP_SECURE === 'true',
  }
}

/** Config derived purely from environment variables (no DB). */
export function envFallbackConfig(): ResolvedNotificationConfig {
  return {
    channels: { EMAIL: true, SMS: false, WHATSAPP: false, IN_APP: true },
    eventChannels: null,
    email: {
      provider: process.env.EMAIL_PROVIDER === 'smtp' ? 'smtp' : 'resend',
      fromEmail: asString(process.env.RESEND_FROM) ?? asString(process.env.SMTP_FROM_EMAIL),
      resendApiKey: asString(process.env.RESEND_API_KEY),
      smtp: envSmtp(),
    },
    sms: {
      provider: 'termii',
      apiKey: asString(process.env.SMS_API_KEY),
      senderId: asString(process.env.SMS_SENDER_ID),
      baseUrl: asString(process.env.SMS_BASE_URL),
    },
    whatsapp: {
      phoneNumberId: asString(process.env.WHATSAPP_PHONE_NUMBER_ID),
      token: asString(process.env.WHATSAPP_TOKEN),
      displayNumber: asString(process.env.WHATSAPP_DISPLAY_NUMBER),
      apiVersion: asString(process.env.WHATSAPP_API_VERSION) ?? 'v19.0',
    },
  }
}

/** Coerces the stored JSON matrix into a typed, sanitisable map (or null). */
export function normalizeEventChannels(
  value: unknown,
): Partial<Record<string, NotificationChannel[]>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Partial<Record<string, NotificationChannel[]>> = {}
  for (const [event, channels] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(channels)) continue
    out[event] = channels.filter((c): c is NotificationChannel =>
      NOTIFICATION_CHANNELS.includes(c as NotificationChannel),
    )
  }
  return Object.keys(out).length ? out : null
}

function resolveFrom(row: NotificationSetting | null): ResolvedNotificationConfig {
  const fallback = envFallbackConfig()
  if (!row) return fallback

  const dbSmtp: SmtpConfig | null =
    row.smtpHost && row.smtpUser && row.smtpPassword
      ? {
          host: row.smtpHost,
          port: row.smtpPort ?? 587,
          user: row.smtpUser,
          password: decryptSecret(row.smtpPassword) ?? '',
          secure: row.smtpSecure,
        }
      : null

  return {
    channels: {
      EMAIL: row.emailEnabled,
      SMS: row.smsEnabled,
      WHATSAPP: row.whatsappEnabled,
      // The in-app inbox is always available and is not provider-gated.
      IN_APP: true,
    },
    eventChannels: normalizeEventChannels(row.eventChannels),
    email: {
      provider: row.emailProvider === 'smtp' ? 'smtp' : 'resend',
      fromEmail: asString(row.fromEmail) ?? fallback.email.fromEmail,
      resendApiKey: decryptSecret(row.emailApiKey) ?? fallback.email.resendApiKey,
      smtp: dbSmtp ?? fallback.email.smtp,
    },
    sms: {
      provider: asString(row.smsProvider) ?? 'termii',
      apiKey: decryptSecret(row.smsApiKey) ?? fallback.sms.apiKey,
      senderId: asString(row.smsSenderId) ?? fallback.sms.senderId,
      baseUrl: asString(row.smsBaseUrl) ?? fallback.sms.baseUrl,
    },
    whatsapp: {
      phoneNumberId: asString(row.whatsappPhoneNumberId) ?? fallback.whatsapp.phoneNumberId,
      token: decryptSecret(row.whatsappToken) ?? fallback.whatsapp.token,
      displayNumber: asString(row.whatsappDisplayNumber) ?? fallback.whatsapp.displayNumber,
      apiVersion: asString(row.whatsappApiVersion) ?? fallback.whatsapp.apiVersion,
    },
  }
}

/**
 * Synchronous best-effort snapshot. When the cache is cold or stale this kicks
 * off a background refresh and returns the current (env-based) snapshot, so
 * sync callers like `isSmsConfigured()` never block.
 */
export function getNotificationConfigSync(): ResolvedNotificationConfig {
  if (!cache || Date.now() - loadedAt > CACHE_TTL_MS) {
    void loadNotificationConfig()
  }
  return cache ?? envFallbackConfig()
}

/** Loads (and caches) the effective config from the DB with env fallback. */
export async function loadNotificationConfig(force = false): Promise<ResolvedNotificationConfig> {
  if (!force && cache && Date.now() - loadedAt < CACHE_TTL_MS) return cache
  try {
    const row = await prisma.notificationSetting.findFirst({ orderBy: { id: 'asc' } })
    cache = resolveFrom(row)
  } catch (error) {
    console.error(
      '[notification-config] failed to load settings, using env fallback:',
      (error as Error).message,
    )
    cache = envFallbackConfig()
  }
  loadedAt = Date.now()
  return cache
}

/** Clears the cache so the next read reflects a just-saved admin change. */
export function invalidateNotificationConfig(): void {
  cache = null
  loadedAt = 0
}

/** Warms the cache at boot so sync checks see DB-configured credentials. */
export async function primeNotificationConfig(): Promise<void> {
  await loadNotificationConfig(true)
}

/** Whether an event is allowed to send on a channel (matrix defaults to on). */
export function isEventChannelEnabled(
  config: ResolvedNotificationConfig,
  event: string,
  channel: NotificationChannel,
): boolean {
  if (!config.eventChannels) return true
  const allowed = config.eventChannels[event]
  // Event absent from the matrix ⇒ enabled everywhere (default).
  if (allowed === undefined) return true
  return allowed.includes(channel)
}
