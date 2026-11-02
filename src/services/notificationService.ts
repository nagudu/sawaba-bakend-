import { prisma } from '../config/database'
import type { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client'
import { NotFoundError } from '../utils/errors'
import { toE164 } from '../utils/phone'
import { sendEmail, isEmailConfigured, isValidRecipient, type OutgoingEmail } from './mailer'
import { sendSms, isSmsConfigured } from './smsService'
import { sendWhatsApp, isWhatsAppConfigured } from './whatsappService'
import {
  loadNotificationConfig,
  isEventChannelEnabled,
  NOTIFICATION_CHANNELS,
} from './notificationConfigService'

/**
 * Customer notification orchestrator — SMS / WhatsApp / Email.
 *
 * Every meaningful customer-facing action (registration, booking confirmation,
 * payment success / failure, order lifecycle, reminders, cancellation & refund
 * updates) funnels through `sendCustomerNotification`, which:
 *   - resolves the admin channel toggles + provider state from the
 *     `notification_settings` singleton,
 *   - respects per-customer opt-ins (email / SMS / WhatsApp),
 *   - resolves per-event / per-channel copy from `notification_templates`
 *     (falling back to the branded defaults below),
 *   - dedupes via a stable `dedupeKey` so repeats / retries never double-send,
 *   - sends through the configured provider per channel and records the delivery
 *     outcome (SENT / FAILED / SKIPPED) in `customer_notifications`,
 *   - never lets a notification failure break the business action itself
 *     (dispatch failures are recorded, not thrown outward).
 */

export type { NotificationChannel, NotificationStatus, NotificationType }

export const CUSTOMER_NOTIFICATION_EVENTS: NotificationType[] = [
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
]

export interface NotificationCustomer {
  id?: number | null
  fullName?: string | null
  phone?: string | null
  email?: string | null
}

export interface NotificationDispatchContext {
  appointmentId?: number | null
  orderId?: number | null
  appointmentRef?: string | null
  orderRef?: string | null
  serviceName?: string | null
  barberName?: string | null
  appointmentDate?: string | null
  appointmentTime?: string | null
  amount?: number | null
  paymentMethod?: string | null
  paymentStatus?: string | null
  status?: string | null
  reason?: string | null
  deliveryMethod?: 'DELIVERY' | 'PICKUP' | null
  collectionCode?: string | null
  trackingInfo?: string | null
  /** Secure, signed link the customer can open to view the order (no login). */
  trackingUrl?: string | null
}

export interface NotificationDeliveryResult {
  status: NotificationStatus
  dedupeKey: string
  deliveries: Array<{
    channel: NotificationChannel
    status: NotificationStatus
    error?: string
    providerMessageId?: string | null
  }>
}

export interface NotificationContent {
  title: string
  subject: string
  text: string
  html?: string
}

const BRAND = 'SAWABA Grooming Studio'

function firstNameOf(name?: string | null): string {
  const trimmed = (name ?? '').trim()
  return trimmed.split(/\s+/)[0] || 'there'
}

function formatMoney(amount: number | null | undefined): string {
  const value = Number(amount ?? 0)
  const safe = Number.isFinite(value) ? value : 0
  return `₦${safe.toLocaleString('en-NG')}`
}

function formatDateTime(date?: string | null, time?: string | null): string {
  if (date && time) return `${date} at ${time}`
  return date ?? time ?? ''
}

function defaultContent(event: NotificationType, ctx: NotificationDispatchContext, customerName?: string | null): NotificationContent {
  const ref = ctx.appointmentRef ?? ctx.orderRef ?? 'your reference'
  const when = formatDateTime(ctx.appointmentDate, ctx.appointmentTime)
  const first = firstNameOf(customerName)
  const trackLine = ctx.trackingUrl ? `Track your order: ${ctx.trackingUrl}` : ''

  switch (event) {
    case 'WELCOME':
      return {
        title: 'Welcome to SAWABA',
        subject: `Welcome to ${BRAND}!`,
        text: [
          `Hello ${first},`,
          '',
          'Welcome to SAWABA Grooming Studio. We are glad you are here.',
          'Book a grooming appointment or browse the shop and send us a message whenever you are ready.',
          '',
          '— SAWABA Grooming Studio',
        ].join('\n'),
      }
    case 'BOOKING_CONFIRMATION': {
      const service = ctx.serviceName ?? 'your grooming service'
      const barber = ctx.barberName ? `Barber: ${ctx.barberName}` : ''
      const amount = ctx.amount ? `Amount: ${formatMoney(ctx.amount)}` : ''
      const paymentNote =
        ctx.paymentStatus === 'PAID'
          ? 'Your payment has been confirmed.'
          : ctx.paymentStatus === 'PENDING_VERIFICATION'
            ? 'Your payment is awaiting verification.'
            : ctx.paymentStatus === 'UNPAID'
              ? 'Your booking is awaiting payment confirmation.'
              : ''
      return {
        title: 'Booking confirmed',
        subject: `Booking confirmed — ${BRAND} (${ref})`,
        text: [
          `Hello ${first},`,
          '',
          `Your grooming booking at ${BRAND} is confirmed.`,
          `Reference: ${ref}`,
          `Date: ${when}`,
          `Service: ${service}`,
          barber,
          amount,
          paymentNote,
          '',
          'If you need to reschedule or cancel, please contact the studio.',
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
        html: `<p>Hello ${first},</p><p>Your grooming booking at <strong>${BRAND}</strong> is confirmed.</p><p><strong>Reference:</strong> ${ref}<br/><strong>Date:</strong> ${when}<br/><strong>Service:</strong> ${service}</p>${amount ? `<p><strong>${amount}</strong></p>` : ''}${paymentNote ? `<p>${paymentNote}</p>` : ''}<p>If you need to reschedule or cancel, please contact the studio.</p><p>— SAWABA Grooming Studio</p>`,
      }
    }
    case 'BOOKING_STATUS': {
      const statusLabels: Record<string, string> = {
        PAYMENT_REQUIRED: 'is awaiting payment',
        PAYMENT_SUBMITTED: 'has a payment under review',
        PAYMENT_VERIFIED: 'has been verified and is confirmed',
        PAYMENT_REJECTED: 'payment was rejected',
        READY_FOR_SERVICE: 'is ready for service',
        IN_PROGRESS: 'is now in progress',
        COMPLETED: 'has been completed',
      }
      const statusText = ctx.status
        ? statusLabels[ctx.status] ?? `status updated to ${ctx.status}`
        : 'has been updated'
      return {
        title: 'Booking update',
        subject: `Booking update — ${BRAND} (${ref})`,
        text: [
          `Hello ${first},`,
          '',
          `An update on your booking ${ref}: ${statusText}.`,
          when ? `When: ${when}` : '',
          ctx.reason ? `Reason: ${ctx.reason}` : '',
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
      }
    }
    case 'BOOKING_REMINDER': {
      const service = ctx.serviceName ? `Service: ${ctx.serviceName}` : ''
      const barber = ctx.barberName ? `Barber: ${ctx.barberName}` : ''
      return {
        title: 'Appointment reminder',
        subject: `Reminder: your ${BRAND} appointment (${ref})`,
        text: [
          `Hello ${first},`,
          '',
          `This is a friendly reminder of your upcoming appointment at ${BRAND}.`,
          `Reference: ${ref}`,
          when ? `When: ${when}` : '',
          service,
          barber,
          '',
          'If you need to reschedule or cancel, please contact the studio as soon as possible.',
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
      }
    }
    case 'BOOKING_CANCELLED': {
      const reason = ctx.reason ? `Reason: ${ctx.reason}` : ''
      return {
        title: 'Booking cancelled',
        subject: `Booking cancelled — ${BRAND} (${ref})`,
        text: [
          `Hello ${first},`,
          '',
          `Your grooming booking at ${BRAND} (${ref}) has been cancelled.`,
          when ? `It was scheduled for ${when}.` : '',
          reason,
          'If you believe this was a mistake, please contact the studio to reschedule.',
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
      }
    }
    case 'ORDER_CONFIRMATION': {
      const amount = ctx.amount ? `Amount: ${formatMoney(ctx.amount)}` : ''
      const method = ctx.paymentMethod ? `Payment method: ${ctx.paymentMethod}` : ''
      const delivery = ctx.deliveryMethod === 'PICKUP' ? 'This is a store pickup order.' : 'This is a home delivery order.'
      return {
        title: 'Order confirmed',
        subject: `Order confirmed — ${BRAND} (${ctx.orderRef ?? ref})`,
        text: [
          `Hello ${first},`,
          '',
          `Thank you — your order at ${BRAND} has been received.`,
          `Order: ${ctx.orderRef ?? ref}`,
          amount,
          method,
          '',
          delivery,
          '',
          'The studio team is preparing your order. We will keep you posted.',
          trackLine,
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
      }
    }
    case 'ORDER_STATUS': {
      const statusLabels: Record<string, string> = {
        PROCESSING: 'is now being processed',
        READY_FOR_PICKUP: 'is ready for store pickup',
        SHIPPED: 'has been shipped out for delivery',
        OUT_FOR_DELIVERY: 'is out for delivery',
        DELIVERED: 'has been delivered',
        COLLECTED: 'has been collected',
        READY_FOR_SERVICE: 'is cleared for service',
      }
      const statusText = ctx.status ? statusLabels[ctx.status] ?? `status updated to ${ctx.status}` : ''
      const tracking = ctx.trackingInfo ? `Tracking: ${ctx.trackingInfo}` : ''
      return {
        title: 'Order update',
        subject: `Order update — ${BRAND} (${ctx.orderRef ?? ref})`,
        text: [
          `Hello ${first},`,
          '',
          `An update on your order ${ctx.orderRef ?? ref}: ${statusText}.`,
          tracking,
          trackLine,
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
      }
    }
    case 'PAYMENT_SUCCESS': {
      const amount = ctx.amount ? `Amount: ${formatMoney(ctx.amount)}` : ''
      const method = ctx.paymentMethod ? `Method: ${ctx.paymentMethod}` : ''
      return {
        title: 'Payment confirmed',
        subject: `Payment confirmed — ${BRAND} (${ctx.appointmentRef ?? ctx.orderRef ?? ref})`,
        text: [
          `Hello ${first},`,
          '',
          `Great news — your payment at ${BRAND} has been verified.`,
          `Reference: ${ctx.appointmentRef ?? ctx.orderRef ?? ref}`,
          amount,
          method,
          '',
          'Your booking is cleared for service / your order is being processed.',
          trackLine,
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
      }
    }
    case 'PAYMENT_FAILED': {
      const reason = ctx.reason ? `Reason: ${ctx.reason}` : ''
      const amount = ctx.amount ? `Amount: ${formatMoney(ctx.amount)}` : ''
      return {
        title: 'Payment update',
        subject: `Payment update — ${BRAND} (${ctx.appointmentRef ?? ctx.orderRef ?? ref})`,
        text: [
          `Hello ${first},`,
          '',
          `A payment for your ${BRAND} reference ${ctx.appointmentRef ?? ctx.orderRef ?? ref} could not be completed.`,
          amount,
          reason,
          'Please try again or contact the studio for assistance.',
          trackLine,
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
      }
    }
    case 'ORDER_CANCELLED': {
      const reason = ctx.reason ? `Reason: ${ctx.reason}` : ''
      const amount = ctx.amount ? `Amount: ${formatMoney(ctx.amount)}` : ''
      return {
        title: 'Order cancelled',
        subject: `Order cancelled — ${BRAND} (${ctx.orderRef ?? ref})`,
        text: [
          `Hello ${first},`,
          '',
          `Your order ${ctx.orderRef ?? ref} at ${BRAND} has been cancelled.`,
          amount,
          reason,
          'If this was unexpected, please contact the studio.',
          trackLine,
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
      }
    }
    case 'REFUND_UPDATE': {
      const amount = ctx.amount ? formatMoney(ctx.amount) : null
      const reason = ctx.reason ? `Reason: ${ctx.reason}` : ''
      return {
        title: 'Refund update',
        subject: `Refund update — ${BRAND} (${ctx.orderRef ?? ref})`,
        text: [
          `Hello ${first},`,
          '',
          `A refund${amount ? ` of ${amount}` : ''} has been processed for your order ${ctx.orderRef ?? ref} at ${BRAND}.`,
          reason,
          'Refunds usually reflect within 3-10 business days.',
          trackLine,
          '',
          '— SAWABA Grooming Studio',
        ]
          .filter((line) => line.trim() !== '')
          .join('\n'),
      }
    }
    case 'TEST':
      return {
        title: 'Test notification',
        subject: `Test notification from ${BRAND}`,
        text: [
          'This is a test notification from the SAWABA Grooming Studio notification centre.',
          'If you received this, the notification channel is configured and working.',
          '',
          '— SAWABA Grooming Studio',
        ].join('\n'),
      }
    default:
      return { title: BRAND, subject: BRAND, text: BRAND }
  }
}

/** Resolves template copy for an event/channel, falling back to branded defaults. */
export async function resolveContent(
  event: NotificationType,
  ctx: NotificationDispatchContext,
  channel: NotificationChannel,
  customerName?: string | null,
): Promise<NotificationContent> {
  const fallback = defaultContent(event, ctx, customerName)
  const template = await prisma.notificationTemplate.findFirst({
    where: { event, channel, isActive: true },
  })
  if (!template) {
    return channel === 'EMAIL' ? { ...fallback, html: fallback.html } : fallback
  }
  const text = template.body?.trim() ? template.body : fallback.text
  return {
    title: template.name,
    subject: template.subject?.trim() ? template.subject : fallback.subject,
    text,
    ...(channel === 'EMAIL' ? { html: text } : {}),
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function sendCustomerNotification(input: {
  event: NotificationType
  customer: NotificationCustomer
  context?: NotificationDispatchContext
  channels?: NotificationChannel[]
  dedupeKey?: string
}): Promise<NotificationDeliveryResult> {
  const event = input.event
  const customer = input.customer
  const ctx = input.context ?? {}

  const config = await loadNotificationConfig()
  const globallyEnabled = NOTIFICATION_CHANNELS.filter((c) => config.channels[c])
  const requested = input.channels?.length ? input.channels : globallyEnabled
  const channels = requested.filter((c) => globallyEnabled.includes(c))

  let fullName = customer.fullName ?? ''
  let phone: string | null = customer.phone ?? null
  let email: string | null = customer.email ?? null
  let emailOptIn: boolean | null = null
  let smsOptIn: boolean | null = null
  let whatsappOptIn: boolean | null = null
  if (customer.id) {
    try {
      const record = await prisma.customer.findUnique({ where: { id: customer.id } })
      if (record) {
        fullName = record.fullName
        phone = record.phone
        email = record.email
        emailOptIn = record.emailOptIn
        smsOptIn = record.smsOptIn
        whatsappOptIn = record.whatsappOptIn
      }
    } catch (error) {
      console.error('[notification] customer lookup failed:', (error as Error).message)
    }
  }

  const baseKey =
    input.dedupeKey ??
    `${event}:${customer.id ?? email ?? phone ?? 'guest'}:${ctx.appointmentId ?? ctx.orderId ?? 'na'}`

  const deliveries: NotificationDeliveryResult['deliveries'] = []
  let sent = 0
  let failed = 0

  for (const channel of channels) {
    const optedIn =
      channel === 'EMAIL' ? (emailOptIn ?? true) : channel === 'SMS' ? (smsOptIn ?? true) : (whatsappOptIn ?? true)
    if (optedIn === false) {
      deliveries.push({ channel, status: 'SKIPPED', error: 'opted_out' })
      continue
    }
    if (!isEventChannelEnabled(config, event, channel)) {
      deliveries.push({ channel, status: 'SKIPPED', error: 'event_disabled_for_channel' })
      continue
    }

    // Dedupe is PER CHANNEL: one delivery row per (event, subject, channel),
    // otherwise the first channel would suppress the rest.
    const dedupeKey = `${baseKey}:${channel}`
    try {
      const existing = await prisma.customerNotification.findUnique({ where: { dedupeKey } })
      if (existing) {
        deliveries.push({ channel, status: 'SKIPPED', error: 'duplicate' })
        continue
      }
    } catch (error) {
      console.error('[notification] dedupe check failed:', (error as Error).message)
    }

    const content = await resolveContent(event, ctx, channel, fullName)
    const recipient = channel === 'EMAIL' ? email : phone

    const deliver = async (): Promise<{ status: NotificationStatus; providerMessageId?: string | null; error?: string }> => {
      if (channel === 'EMAIL') {
        if (!recipient || !isValidRecipient(recipient) || !isEmailConfigured()) {
          return { status: 'SKIPPED', error: 'email_unconfigured_or_invalid' }
        }
        const outgoing: OutgoingEmail = { to: recipient, subject: content.subject, text: content.text }
        if (content.html) outgoing.html = content.html
        await sendEmail(outgoing)
        return { status: 'SENT', providerMessageId: 'email-sent' }
      }
      if (channel === 'SMS') {
        if (!recipient || !isSmsConfigured()) {
          return { status: 'SKIPPED', error: 'sms_unconfigured_or_invalid' }
        }
        const e164 = toE164(recipient)
        if (!e164) return { status: 'SKIPPED', error: 'sms_invalid_number' }
        const result = await sendSms(e164, content.text)
        return { status: 'SENT', providerMessageId: result.messageId }
      }
      if (channel === 'WHATSAPP') {
        if (!recipient || !isWhatsAppConfigured()) {
          return { status: 'SKIPPED', error: 'whatsapp_unconfigured_or_invalid' }
        }
        const e164 = toE164(recipient)
        if (!e164) return { status: 'SKIPPED', error: 'whatsapp_invalid_number' }
        const result = await sendWhatsApp(e164, content.text)
        return { status: 'SENT', providerMessageId: result.messageId }
      }
      return { status: 'SKIPPED', error: 'unknown_channel' }
    }

    try {
      const outcome = await deliver()
      await prisma.customerNotification.create({
        data: {
          customerId: customer.id ?? null,
          appointmentId: ctx.appointmentId ?? null,
          orderId: ctx.orderId ?? null,
          type: event,
          channel,
          title: content.title,
          message: content.text,
          status: outcome.status,
          provider:
            outcome.status === 'SENT'
              ? channel === 'EMAIL'
                ? config.email.provider === 'smtp'
                  ? 'smtp'
                  : 'resend'
                : channel === 'SMS'
                  ? config.sms.provider
                  : 'whatsapp'
              : null,
          providerMessageId: outcome.providerMessageId ?? null,
          error: outcome.error ?? null,
          dedupeKey,
          sentAt: outcome.status === 'SENT' ? new Date() : null,
        },
      })
      deliveries.push({ channel, status: outcome.status, error: outcome.error, providerMessageId: outcome.providerMessageId ?? null })
      if (outcome.status === 'SENT') sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notification delivery failed.'
      deliveries.push({ channel, status: 'FAILED', error: message })
      failed += 1
      try {
        await prisma.customerNotification.create({
          data: {
            customerId: customer.id ?? null,
            appointmentId: ctx.appointmentId ?? null,
            orderId: ctx.orderId ?? null,
            type: event,
            channel,
            title: content.title,
            message: content.text,
            status: 'FAILED',
            provider: null,
            error: message.slice(0, 400),
            dedupeKey,
          },
        })
      } catch {
        deliveries[deliveries.length - 1].status = 'SKIPPED'
        failed -= 1
      }
    }
  }

  const overall: NotificationStatus = sent > 0 ? 'SENT' : failed > 0 ? 'FAILED' : 'SKIPPED'
  return { status: overall, dedupeKey: baseKey, deliveries }
}

/**
 * Fire-and-forget wrapper for business flows: records/never throws, so a
 * notification problem can never break the action that triggered it.
 */
export async function dispatchNotification(input: {
  event: NotificationType
  customer: NotificationCustomer
  context?: NotificationDispatchContext
  channels?: NotificationChannel[]
  dedupeKey?: string
}): Promise<void> {
  try {
    await sendCustomerNotification(input)
  } catch (error) {
    console.error('[notification] dispatch failed:', (error as Error).message)
  }
}

/** Re-delivers a failed notification record. Safe: only FAILED rows can be retried. */
export async function retryCustomerNotification(id: number): Promise<{ ok: boolean; status?: NotificationStatus }> {
  const record = await prisma.customerNotification.findUnique({ where: { id } })
  if (!record) throw new NotFoundError('Notification not found.')
  if (record.status !== 'FAILED') {
    return { ok: true, status: record.status }
  }
  const customer = record.customerId
    ? await prisma.customer.findUnique({
        where: { id: record.customerId },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          emailOptIn: true,
          smsOptIn: true,
          whatsappOptIn: true,
        },
      })
    : null
  if (!customer) {
    await prisma.customerNotification.update({
      where: { id },
      data: { status: 'SKIPPED', error: 'Customer record unavailable.' },
    })
    return { ok: true, status: 'SKIPPED' }
  }
  const result = await sendCustomerNotification({
    event: record.type,
    customer: { id: customer.id, fullName: customer.fullName, phone: customer.phone, email: customer.email },
    context: { appointmentId: record.appointmentId, orderId: record.orderId },
    channels: [record.channel],
    dedupeKey: `retry:${record.id}`,
  })
  await prisma.customerNotification.update({
    where: { id },
    data: {
      status: result.status,
      error: result.deliveries[0]?.error ?? null,
      sentAt: result.status === 'SENT' ? new Date() : null,
    },
  })
  return { ok: true, status: result.status }
}
