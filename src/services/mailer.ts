import { Resend } from 'resend'
import nodemailer, { type Transporter, type SentMessageInfo } from 'nodemailer'
import { loadNotificationConfig, getNotificationConfigSync, type SmtpConfig } from './notificationConfigService'

/**
 * Email delivery with two providers, resolved at send time from the admin
 * `notification_settings` row with environment fallback (see
 * notificationConfigService) — never hard-coded, never logged:
 *
 *  1. Resend HTTP API   — used when a Resend API key is configured (recommended:
 *                         no SMTP ports to fight, accepts JSON, returns a message id).
 *  2. SMTP / Nodemailer — used when SMTP host/user/password are configured.
 *
 * Either way this module NEVER pretends to succeed: without configuration (or
 * when the provider rejects a send) it throws EmailDeliveryError, which callers
 * surface to the user / record as a FAILED delivery.
 */

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string
}

export interface EmailSendReceipt {
  provider: 'resend' | 'smtp'
  messageId: string | undefined
  accepted: string[]
  rejected: string[]
  response: string
}

/** Error carrying a user-safe message; the raw cause stays in server logs only. */
export class EmailDeliveryError extends Error {
  readonly userMessage: string

  constructor(userMessage: string, cause?: unknown) {
    super(userMessage)
    this.name = 'EmailDeliveryError'
    this.userMessage = userMessage
    if (cause instanceof Error) this.stack = `${this.stack}\nCaused by: ${cause.stack}`
  }
}

// ── Cached clients (rebuilt when the underlying credentials change) ───────────

let resendClient: Resend | null = null
let resendKey: string | null = null

function getResend(apiKey: string | null): Resend | null {
  if (!apiKey) return null
  if (resendClient && resendKey === apiKey) return resendClient
  resendClient = new Resend(apiKey)
  resendKey = apiKey
  return resendClient
}

let transporter: Transporter | null = null
let transportSig: string | null = null

function getTransport(smtp: SmtpConfig | null): Transporter | null {
  if (!smtp) return null
  const sig = `${smtp.host}|${smtp.port}|${smtp.user}|${smtp.secure}|${smtp.password}`
  if (transporter && transportSig === sig) return transporter
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure || smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  transportSig = sig
  return transporter
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function composeFrom(raw: string): string {
  const trimmed = raw.trim()
  // Already composed as "Name <email>" — use exactly as provided (never re-wrap,
  // double-wrapping makes providers reject the from field).
  if (/<[^<>\s]+@[^<>\s]+\.[^<>\s]+>$/.test(trimmed)) return trimmed
  const fromName = process.env.SMTP_FROM_NAME ?? 'SAWABA Grooming Studio'
  return `${fromName} <${trimmed}>`
}

function defaultFrom(): string {
  const raw = (process.env.SMTP_FROM_EMAIL ?? process.env.RESEND_FROM ?? 'onboarding@resend.dev').trim()
  return composeFrom(raw)
}

function resolveProvider(cfg: {
  provider: 'resend' | 'smtp'
  resendApiKey: string | null
  smtp: SmtpConfig | null
}): 'resend' | 'smtp' | 'none' {
  if (cfg.provider === 'resend') {
    if (cfg.resendApiKey) return 'resend'
    return cfg.smtp ? 'smtp' : 'none'
  }
  if (cfg.smtp) return 'smtp'
  return cfg.resendApiKey ? 'resend' : 'none'
}

export function isEmailConfigured(): boolean {
  return activeProvider() !== 'none'
}

export function activeProvider(): 'resend' | 'smtp' | 'none' {
  return resolveProvider(getNotificationConfigSync().email)
}

export function getFromAddress(): string {
  const cfg = getNotificationConfigSync().email
  return cfg.fromEmail ? composeFrom(cfg.fromEmail) : defaultFrom()
}

/** Maps a raw SMTP failure to a clean, user-safe explanation. */
function smtpDeliveryError(error: unknown): EmailDeliveryError {
  const code = (error as { code?: string } | null)?.code ?? ''
  const syscall = (error as { syscall?: string } | null)?.syscall
  const command = (error as { command?: string } | null)?.command

  if (code === 'EAUTH' || code === 'EAUTHFAILED' || command === 'AUTH' || code === '535') {
    return new EmailDeliveryError('Email service authentication failed.', error)
  }
  if (
    code === 'ECONNECTION' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNTIMEDOUT' ||
    (syscall === 'connect' && code !== 'ECONNRESET') ||
    code === 'ESOCKET'
  ) {
    return new EmailDeliveryError('Unable to connect to the email server.', error)
  }
  return new EmailDeliveryError(
    'The email service failed to send this message. Please try again or contact the administrator.',
    error,
  )
}

/** Maps a Resend API failure to a clean, user-safe explanation. */
function resendDeliveryError(status: number, message: string, cause?: unknown): EmailDeliveryError {
  if (status === 401) {
    return new EmailDeliveryError('Email service authentication failed.', cause)
  }
  if (status === 403) {
    // Resend has TWO very different 403s — report the real one, not a generic guess.
    const ownerMatch = message.match(/your own email address \(([^)]+)\)/i)
    if (ownerMatch) {
      return new EmailDeliveryError(
        `Email is in provider test mode — messages can only be delivered to ${ownerMatch[1]} until a sending domain is verified or SMTP is configured. The message was not sent.`,
        cause,
      )
    }
    const domainMatch = message.match(/The ([^\s]+) domain is not verified/i)
    if (domainMatch) {
      return new EmailDeliveryError(
        `The sending domain "${domainMatch[1]}" is not verified with the email provider — verify it at resend.com/domains or configure SMTP. The message was not sent.`,
        cause,
      )
    }
    if (/domain|verif|testing emails|allowed to send/i.test(message)) {
      return new EmailDeliveryError(
        'The email service cannot send from this sender yet — the sender domain must be verified with the provider first. The message was not sent.',
        cause,
      )
    }
    return new EmailDeliveryError('Email service authentication failed.', cause)
  }
  if (status === 422) {
    // Resend uses 422 for validation problems. Check the SENDER (`from`) before
    // the recipient — a bad from field is a server config issue, not the customer.
    if (/`from` field|from field|sender/i.test(message)) {
      return new EmailDeliveryError(
        'The email sender address is misconfigured. Please contact the administrator.',
        cause,
      )
    }
    if (/recipient|invalid.*email|`to` field/i.test(message)) {
      return new EmailDeliveryError('Invalid customer email address.', cause)
    }
    return new EmailDeliveryError('The email provider rejected this recipient.', cause)
  }
  if (status === 429) {
    return new EmailDeliveryError(
      'The email service is rate limited. Please try again in a moment.',
      cause,
    )
  }
  return new EmailDeliveryError(
    'The email service failed to send this message. Please try again or contact the administrator.',
    cause,
  )
}

/** RFC 5322-lite recipient sanity check before we pay an API call for it. */
export function isValidRecipient(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function sendViaResend(client: Resend, email: OutgoingEmail, from: string): Promise<EmailSendReceipt> {
  try {
    const { data, error } = await client.emails.send({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    })
    if (error) {
      console.error('[mailer] resend rejected:', error.name, error.message)
      throw resendDeliveryError(error.statusCode ?? 500, error.message)
    }
    console.log(`[mailer] delivered via resend to ${email.to} | messageId=${data?.id ?? 'n/a'}`)
    return {
      provider: 'resend',
      messageId: data?.id,
      accepted: [email.to],
      rejected: [],
      response: `resend accepted (id=${data?.id ?? 'n/a'})`,
    }
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error
    console.error('[mailer] resend request failed:', (error as Error).message)
    throw resendDeliveryError(500, (error as Error).message, error)
  }
}

async function sendViaSmtp(
  transport: Transporter,
  email: OutgoingEmail,
  from: string,
): Promise<EmailSendReceipt> {
  let info: SentMessageInfo
  try {
    info = await transport.sendMail({
      from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    })
  } catch (error) {
    const err = error as { code?: string; message?: string }
    console.error('[mailer] send failed:', err.code ?? '', err.message ?? error)
    throw smtpDeliveryError(error)
  }

  const receipt: EmailSendReceipt = {
    provider: 'smtp',
    messageId: info.messageId,
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: info.response ?? '',
  }

  if (receipt.rejected.includes(email.to)) {
    console.error(`[mailer] provider rejected recipient ${email.to}: ${receipt.response}`)
    throw new EmailDeliveryError('The email provider rejected this recipient.')
  }
  if (receipt.accepted.length === 0) {
    console.error(`[mailer] provider accepted nobody for ${email.to}: ${receipt.response}`)
    throw new EmailDeliveryError('The email provider did not accept this message for delivery.')
  }

  console.log(
    `[mailer] delivered to ${receipt.accepted.join(', ')} | messageId=${receipt.messageId ?? 'n/a'} | ${receipt.response}`,
  )
  return receipt
}

export async function sendEmail(email: OutgoingEmail): Promise<EmailSendReceipt> {
  if (!isValidRecipient(email.to)) {
    throw new EmailDeliveryError('Invalid customer email address.')
  }

  const cfg = (await loadNotificationConfig()).email
  const from = cfg.fromEmail ? composeFrom(cfg.fromEmail) : defaultFrom()
  const provider = resolveProvider(cfg)

  if (provider === 'resend') {
    try {
      return await sendViaResend(getResend(cfg.resendApiKey)!, email, from)
    } catch (error) {
      // A configured SMTP transport is a real fallback: sandbox limits,
      // unverified domains or a Resend outage must not block messaging when
      // working SMTP credentials exist. If SMTP is absent (or also fails),
      // the original failure surfaces unchanged.
      const transport = getTransport(cfg.smtp)
      if (transport) {
        console.warn('[mailer] resend rejected — trying SMTP fallback:', (error as Error).message)
        return sendViaSmtp(transport, email, from)
      }
      throw error
    }
  }
  if (provider === 'smtp') return sendViaSmtp(getTransport(cfg.smtp)!, email, from)

  throw new EmailDeliveryError(
    'Email service is not configured. Please contact the administrator.',
  )
}

/** Verifies credentials/connectivity without sending anything. Used by `npm run smtp:verify`. */
export async function verifyEmailProvider(): Promise<void> {
  const cfg = (await loadNotificationConfig()).email
  const provider = resolveProvider(cfg)

  if (provider === 'resend') {
    const client = getResend(cfg.resendApiKey)!
    // Light authenticated read: listing the single most recent email proves the API key works.
    const { error } = await client.emails.list({ limit: 1 })
    if (error) {
      // A send-only (restricted) key cannot read, but Resend's own error message
      // confirms the key is valid AND allowed to send — which is all we need.
      if ((error as { name?: string }).name === 'restricted_api_key') {
        console.log('[mailer] key is send-only (restricted_api_key) — sending is permitted')
        const transport = getTransport(cfg.smtp)
        if (transport) await transport.verify()
        return
      }
      throw new EmailDeliveryError(
        error.statusCode === 401 || error.statusCode === 403
          ? 'Email service authentication failed.'
          : 'Unable to connect to the email server.',
      )
    }
    return
  }
  if (provider === 'smtp') {
    await getTransport(cfg.smtp)!.verify()
    return
  }
  throw new EmailDeliveryError(
    'Email service is not configured. Please contact the administrator.',
  )
}

/** Back-compat alias used by the verify script. */
export const verifySmtp = verifyEmailProvider
