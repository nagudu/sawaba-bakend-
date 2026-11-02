import 'dotenv/config'
import { prisma } from '../config/database'
import {
  CUSTOMER_NOTIFICATION_EVENTS,
  resolveContent,
  sendCustomerNotification,
  type NotificationDispatchContext,
} from '../services/notificationService'
import { loadNotificationConfig } from '../services/notificationConfigService'
import type { NotificationChannel } from '@prisma/client'

/**
 * Notification harness — exercises the SMS / WhatsApp / Email system for every
 * customer notification event.
 *
 *   tsx src/scripts/notificationHarness.ts            # audit (no sends)
 *   tsx src/scripts/notificationHarness.ts --live     # real sends + dedupe check
 *
 * Audit mode resolves the branded/templated copy and prints the channel
 * configuration without contacting any provider. Live mode sends to the target
 * customer (HARNESS_CUSTOMER_ID, else ADMIN_NOTIFICATION_EMAIL/PHONE) through
 * every enabled+configured channel and reports each channel's honest outcome,
 * then re-dispatches with the same key to prove duplicates are suppressed.
 *
 * Nothing here fabricates a success: unconfigured channels report SKIPPED and
 * provider failures report FAILED.
 */

const LIVE = process.argv.includes('--live')
const CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS', 'WHATSAPP']

const SAMPLE_CONTEXT: NotificationDispatchContext = {
  appointmentId: 1,
  appointmentRef: 'APT-DEMO-0001',
  orderId: 1,
  orderRef: 'SGS-DEMO-0001',
  serviceName: 'Signature Cut & Beard',
  barberName: 'Demo Barber',
  appointmentDate: '2026-01-15',
  appointmentTime: '10:30',
  amount: 15000,
  paymentMethod: 'BANK_TRANSFER',
  paymentStatus: 'PAID',
  status: 'PROCESSING',
  deliveryMethod: 'DELIVERY',
  collectionCode: 'PICK-DEMO1',
  trackingUrl: 'https://example.com/track?token=EXAMPLE-TOKEN',
}

async function main(): Promise<void> {
  const config = await loadNotificationConfig(true)
  const emailReady = Boolean(config.email.resendApiKey || config.email.smtp)
  const smsReady = Boolean(config.sms.apiKey && config.sms.senderId)
  const waReady = Boolean(config.whatsapp.phoneNumberId && config.whatsapp.token)

  console.log('── SAWABA notification harness ──────────────────────────────')
  console.log(`Mode           : ${LIVE ? 'LIVE (real sends)' : 'AUDIT (no sends)'}`)
  console.log(`Channel toggles: EMAIL=${config.channels.EMAIL} SMS=${config.channels.SMS} WHATSAPP=${config.channels.WHATSAPP}`)
  console.log(`Configured     : EMAIL=${emailReady} SMS=${smsReady} WHATSAPP=${waReady}`)
  console.log(`Event matrix   : ${config.eventChannels ? JSON.stringify(config.eventChannels) : '(all events enabled)'}`)
  console.log('')

  const customerId = Number(process.env.HARNESS_CUSTOMER_ID) || null
  const customer = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId } })
    : null
  const target = customer
    ? { id: customer.id, fullName: customer.fullName, phone: customer.phone, email: customer.email }
    : {
        fullName: 'Harness',
        phone: process.env.ADMIN_NOTIFICATION_PHONE ?? null,
        email: process.env.ADMIN_NOTIFICATION_EMAIL ?? null,
      }
  console.log('Recipient:', customer ? `customer #${customer.id}` : `env default (${target.email ?? 'no email'} / ${target.phone ?? 'no phone'})`)
  console.log('')

  const events = CUSTOMER_NOTIFICATION_EVENTS.filter((event) => event !== 'TEST')

  for (const event of events) {
    if (!LIVE) {
      for (const channel of CHANNELS) {
        const content = await resolveContent(event, SAMPLE_CONTEXT, channel, target.fullName ?? 'Customer')
        const preview = content.text.replace(/\s+/g, ' ').trim().slice(0, 90)
        console.log(`[audit] ${event.padEnd(22)} ${channel.padEnd(9)} ${preview}…`)
      }
      continue
    }

    const runKey = `harness:${event}:${Date.now()}`
    const result = await sendCustomerNotification({ event, customer: target, context: SAMPLE_CONTEXT, dedupeKey: runKey })
    const summary = result.deliveries
      .map((d) => `${d.channel}:${d.status}${d.error && d.status !== 'SENT' ? `(${d.error})` : ''}`)
      .join(' ')
    console.log(`[live]  ${event.padEnd(22)} ${result.status.padEnd(8)} ${summary}`)

    const duplicate = await sendCustomerNotification({ event, customer: target, context: SAMPLE_CONTEXT, dedupeKey: runKey })
    const allSkipped = duplicate.deliveries.every((d) => d.status === 'SKIPPED')
    console.log(`[live]  ${event.padEnd(22)} dedupe ${allSkipped ? 'OK (all channels suppressed)' : 'FAILED (a channel re-sent)'}`)
  }

  console.log('')
  const sampleOrder = await resolveContent('ORDER_CONFIRMATION', SAMPLE_CONTEXT, 'SMS', 'Harness')
  console.log(
    `Tracking-link check: ${sampleOrder.text.includes('Track your order:') ? 'PASS (order copy includes the secure link)' : 'FAIL'}`,
  )
  console.log('Done.')
}

main()
  .catch((error) => {
    console.error('[harness] failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
