import { getNotificationConfigSync, loadNotificationConfig } from './notificationConfigService'

/**
 * WhatsApp delivery adapter (Meta WhatsApp Cloud API). Credentials are resolved
 * at send time from the admin `notification_settings` row with environment
 * fallback (see notificationConfigService):
 *
 *   phoneNumberId — Meta Cloud API phone number id (required to enable).
 *   token         — Meta Cloud API permanent access token (required).
 *   displayNumber — customer-facing display number (optional).
 *   apiVersion    — API version override (default v19.0).
 *
 * Like the mailer / SMS adapters this module NEVER pretends to succeed: without
 * configuration or a rejected/unsendable request it throws WhatsAppDeliveryError
 * whose user-safe message callers surface.
 */

export class WhatsAppDeliveryError extends Error {
  readonly userMessage: string

  constructor(userMessage: string, cause?: unknown) {
    super(userMessage)
    this.name = 'WhatsAppDeliveryError'
    this.userMessage = userMessage
    if (cause instanceof Error) this.stack = `${this.stack}\nCaused by: ${cause.stack}`
  }
}

/** True when WhatsApp delivery is fully configured (phone number id + token). */
export function isWhatsAppConfigured(): boolean {
  const wa = getNotificationConfigSync().whatsapp
  return Boolean(wa.phoneNumberId && wa.token)
}

function apiBase(version: string): string {
  const clean = (version || 'v19.0').trim().replace(/^\//, '')
  return `https://graph.facebook.com/${clean}`
}

export interface WhatsAppSendReceipt {
  provider: 'whatsapp'
  messageId: string | undefined
  response: string
}

interface WhatsAppResponseBody {
  messages?: Array<{ id?: string }>
  error?: { message?: string; type?: string }
}

/**
 * Sends a plain-text message through the WhatsApp Cloud API.
 * `toE164` is the recipient's phone in E.164 form (e.g. +2348012345678).
 */
export async function sendWhatsApp(toE164: string, message: string): Promise<WhatsAppSendReceipt> {
  const wa = (await loadNotificationConfig()).whatsapp
  if (!wa.phoneNumberId || !wa.token) {
    throw new WhatsAppDeliveryError('WhatsApp is not configured. Please contact the administrator.')
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: toE164.replace(/[^\d+]/g, ''),
    type: 'text',
    text: { body: message },
  }

  let response: Response
  try {
    response = await fetch(`${apiBase(wa.apiVersion)}/${wa.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wa.token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new WhatsAppDeliveryError('Unable to connect to the WhatsApp service. Please try again in a moment.')
  }

  const body = (await response.json().catch(() => null)) as WhatsAppResponseBody | null

  if (!response.ok || !body?.messages?.length) {
    console.error(
      `[whatsapp] provider rejected the send (status ${response.status}):`,
      body?.error?.message ?? response.statusText,
    )
    throw new WhatsAppDeliveryError('The WhatsApp provider rejected this message. Please try again in a moment.')
  }

  const messageId = body.messages[0].id
  console.log(`[whatsapp] delivered to ${toE164} | messageId=${messageId ?? 'n/a'}`)
  return {
    provider: 'whatsapp',
    messageId: messageId ?? undefined,
    response: body.messages[0].id ?? 'accepted',
  }
}

/** Verifies the Cloud API credentials without sending anything. Used by admin tests. */
export async function verifyWhatsAppProvider(): Promise<void> {
  const wa = (await loadNotificationConfig()).whatsapp
  if (!wa.phoneNumberId || !wa.token) {
    throw new WhatsAppDeliveryError('WhatsApp is not configured. Please contact the administrator.')
  }
  const response = await fetch(`${apiBase(wa.apiVersion)}/${wa.phoneNumberId}/messages`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${wa.token}` },
  })
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new WhatsAppDeliveryError(json?.error?.message ?? 'WhatsApp provider verification failed.')
  }
}
