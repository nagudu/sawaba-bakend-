import { prisma } from '../config/database'
import { env } from '../config/env'
import { sendEmail, isEmailConfigured, isValidRecipient } from './mailer'
import { isSmsConfigured, sendSms } from './smsService'

/**
 * Automatic appointment reminders.
 *
 * Every appointment that has a reachable contact (email and/or phone) gets a
 * reminder a configured number of hours before it starts (default: 24h and 1h).
 * Delivery prefers email and falls back to SMS — the only channels that are
 * actually integrated. Nothing here requires admin action.
 *
 * The job is invoked two ways:
 *   1. A Vercel Cron (serverless) hitting POST/GET /api/cron/appointment-reminders.
 *   2. An in-process interval scheduler on long-lived hosts (Railway / local),
 *      started from server.ts.
 *
 * Dedupe: a row in `appointment_reminders` is written only after a successful
 * send. The unique (appointmentId, kind) key stops double-reminding even when
 * the scheduler overlaps or the endpoint is retried.
 */

const REMINDER_LABELS: Record<string, string> = {
  '24H': 'tomorrow',
  '1H': 'in about an hour',
}

function kindForHours(hours: number): string {
  // 24 -> "24H", 1 -> "1H", 2 -> "2H"
  return `${hours}H`
}

/**
 * Picks the reminder due for an appointment `minutesUntil` minutes away.
 *
 * Each window `h` owns a one-hour-wide band ((h-1)h, h*h]: wide enough for an
 * hourly cron to always land inside, narrow enough that a 2-hour-away
 * appointment is never told "tomorrow". Returns the window's kind, or null when
 * no band applies or that reminder was already delivered.
 */
export function selectDueReminder(
  minutesUntil: number,
  sentKinds: Set<string>,
  windows: number[] = env.reminder.hoursBefore,
): string | null {
  for (const h of windows) {
    if (sentKinds.has(kindForHours(h))) continue
    const upper = h * 60
    const lower = (h - 1) * 60
    if (minutesUntil > lower && minutesUntil <= upper) return kindForHours(h)
  }
  return null
}

interface AppointmentForReminder {
  id: number
  referenceCode: string | null
  customerName: string
  customerPhone: string
  customerEmail: string | null
  appointmentDate: string
  appointmentTime: string
  service: { name: string } | null
  barber: { name: string } | null
}

/** Wall-clock appointment date+time (studio timezone) as a real UTC instant. */
export function appointmentInstant(
  appointmentDate: string,
  appointmentTime: string,
  offsetMinutes = env.reminder.timezoneOffsetMinutes,
): Date {
  const [y, m, d] = appointmentDate.split('-').map(Number)
  const [hh, mm] = appointmentTime.split(':').map(Number)
  const asUtc = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0)
  return new Date(asUtc - offsetMinutes * 60_000)
}

function formatDateLong(appointmentDate: string): string {
  const [y, m, d] = appointmentDate.split('-').map(Number)
  // Format the wall-clock date without letting the server's timezone shift it.
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatTime12h(appointmentTime: string): string {
  const [hh, mm] = appointmentTime.split(':').map(Number)
  const hour = hh ?? 0
  const suffix = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:${String(mm ?? 0).padStart(2, '0')} ${suffix}`
}

function buildEmail(
  appointment: AppointmentForReminder,
  hoursBefore: number,
): { subject: string; text: string; html: string } {
  const firstName = appointment.customerName.split(' ')[0] || appointment.customerName
  const when = REMINDER_LABELS[kindForHours(hoursBefore)] ?? `in ${hoursBefore} hours`
  const dateLabel = formatDateLong(appointment.appointmentDate)
  const timeLabel = formatTime12h(appointment.appointmentTime)
  const service = appointment.service?.name ?? 'your appointment'
  const barber = appointment.barber?.name
  const ref = appointment.referenceCode ?? `APT-${appointment.id}`

  const subject = `Reminder: your SAWABA appointment is ${when} (${dateLabel}, ${timeLabel})`
  const text = [
    `Hello ${firstName},`,
    '',
    `This is a friendly reminder that your SAWABA Grooming Studio appointment is approaching — ${when}.`,
    '',
    `Service:   ${service}`,
    barber ? `Barber:    ${barber}` : '',
    `Date:      ${dateLabel}`,
    `Time:      ${timeLabel}`,
    `Reference: ${ref}`,
    '',
    'If you need to reschedule or cancel, please contact the studio as soon as possible.',
    '',
    'See you soon,',
    'SAWABA Grooming Studio',
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = `
    <p>Hello ${firstName},</p>
    <p>This is a friendly reminder that your <strong>SAWABA Grooming Studio</strong> appointment is approaching — <strong>${when}</strong>.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#888">Service</td><td><strong>${service}</strong></td></tr>
      ${barber ? `<tr><td style="padding:4px 12px 4px 0;color:#888">Barber</td><td><strong>${barber}</strong></td></tr>` : ''}
      <tr><td style="padding:4px 12px 4px 0;color:#888">Date</td><td><strong>${dateLabel}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Time</td><td><strong>${timeLabel}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Reference</td><td><strong>${ref}</strong></td></tr>
    </table>
    <p>If you need to reschedule or cancel, please contact the studio as soon as possible.</p>
    <p style="color:#888;font-size:12px">See you soon — SAWABA Grooming Studio</p>
  `.trim()

  return { subject, text, html }
}

function buildSms(appointment: AppointmentForReminder, hoursBefore: number): string {
  const firstName = appointment.customerName.split(' ')[0] || appointment.customerName
  const when = REMINDER_LABELS[kindForHours(hoursBefore)] ?? `in ${hoursBefore} hours`
  const dateLabel = formatDateLong(appointment.appointmentDate)
  const timeLabel = formatTime12h(appointment.appointmentTime)
  return `Hi ${firstName}, reminder: your SAWABA appointment is ${when} — ${dateLabel} at ${timeLabel}. Ref ${appointment.referenceCode ?? `APT-${appointment.id}`}. Reply to reschedule.`
}

/**
 * Deliver one reminder through the best available channel.
 * Returns the channel used, or null when the customer is unreachable / no
 * provider is configured (nothing is sent, nothing is recorded).
 */
async function deliverReminder(
  appointment: AppointmentForReminder,
  hoursBefore: number,
): Promise<'EMAIL' | 'SMS' | null> {
  const email = appointment.customerEmail?.trim()

  if (email && isValidRecipient(email) && isEmailConfigured()) {
    const { subject, text, html } = buildEmail(appointment, hoursBefore)
    await sendEmail({ to: email, subject, text, html })
    return 'EMAIL'
  }

  const phone = appointment.customerPhone?.trim()
  if (phone && isSmsConfigured()) {
    await sendSms(phone, buildSms(appointment, hoursBefore))
    return 'SMS'
  }

  return null
}

export interface ReminderRunResult {
  scanned: number
  sent: number
  skipped: number
  failed: number
  details: Array<{
    appointmentId: number
    kind: string
    channel: string | null
    status: 'SENT' | 'SKIPPED' | 'FAILED'
    error?: string
  }>
}

/**
 * Scan upcoming appointments and send any due reminders.
 *
 * A window `h` hours before the appointment is due once
 * `0 < minutesUntil <= h*60`. The largest window that is due but not yet sent
 * is used first; shorter windows are sent on later ticks, so a customer
 * normally receives both the 24h and the 1h reminder.
 */
export async function sendAppointmentReminders(options: {
  dryRun?: boolean
  now?: Date
} = {}): Promise<ReminderRunResult> {
  const now = options.now ?? new Date()
  const windows = env.reminder.hoursBefore // descending, e.g. [24, 1]
  const maxWindowMinutes = Math.max(...windows, 0) * 60

  const today = now.toISOString().slice(0, 10)
  // Reminders only ever fire within `maxWindowMinutes` of the appointment, so a
  // two-day window is more than enough and keeps the scan small.
  const horizon = new Date(now.getTime() + 48 * 60 * 60_000).toISOString().slice(0, 10)

  const appointments = (await prisma.appointment.findMany({
    where: {
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
      appointmentDate: { gte: today, lte: horizon },
    },
    include: {
      service: { select: { name: true } },
      barber: { select: { name: true } },
      reminders: { select: { kind: true } },
    },
    take: 500,
  })) as unknown as Array<
    AppointmentForReminder & { reminders: Array<{ kind: string }> }
  >

  const result: ReminderRunResult = {
    scanned: appointments.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [],
  }

  for (const appointment of appointments) {
    const minutesUntil =
      (appointmentInstant(appointment.appointmentDate, appointment.appointmentTime, env.reminder.timezoneOffsetMinutes).getTime() -
        now.getTime()) /
      60_000

    if (minutesUntil <= 0 || minutesUntil > maxWindowMinutes) {
      result.skipped += 1
      continue
    }

    const sentKinds = new Set(appointment.reminders.map((r) => r.kind))

    const kind = selectDueReminder(minutesUntil, sentKinds)
    const dueWindow = kind ? windows.find((h) => kindForHours(h) === kind)! : null

    if (!dueWindow || !kind) {
      result.skipped += 1
      continue
    }

    if (options.dryRun) {
      result.details.push({
        appointmentId: appointment.id,
        kind,
        channel: null,
        status: 'SKIPPED',
        error: 'dry-run',
      })
      continue
    }

    try {
      const channel = await deliverReminder(appointment, dueWindow)
      if (!channel) {
        result.skipped += 1
        result.details.push({
          appointmentId: appointment.id,
          kind,
          channel: null,
          status: 'SKIPPED',
          error: 'no deliverable channel',
        })
        continue
      }

      await prisma.appointmentReminder.create({
        data: {
          appointmentId: appointment.id,
          kind,
          channel,
          status: 'SENT',
          sentAt: new Date(),
        },
      })
      result.sent += 1
      result.details.push({
        appointmentId: appointment.id,
        kind,
        channel,
        status: 'SENT',
      })
    } catch (error) {
      result.failed += 1
      result.details.push({
        appointmentId: appointment.id,
        kind,
        channel: null,
        status: 'FAILED',
        error: (error as Error).message,
      })
      console.error(
        `[reminder] failed for appointment ${appointment.id} (${kind}):`,
        (error as Error).message,
      )
    }
  }

  return result
}

let schedulerTimer: NodeJS.Timeout | null = null

/**
 * Starts the in-process reminder scheduler. Only long-lived hosts (Railway,
 * a VPS, local `npm run dev`) run server.ts — Vercel serverless uses the cron
 * endpoint instead, so this is never started there.
 */
export function startReminderScheduler(): void {
  if (schedulerTimer) return
  if (process.env.REMINDER_SCHEDULER_ENABLED === 'false') {
    console.log('[reminder] scheduler disabled via REMINDER_SCHEDULER_ENABLED=false')
    return
  }

  const intervalMs = Math.max(1, env.reminder.schedulerIntervalMinutes) * 60_000

  const tick = (): void => {
    sendAppointmentReminders().catch((error) => {
      console.error('[reminder] scheduled run failed:', (error as Error).message)
    })
  }

  // Give the DB connection a moment, then run on a fixed interval.
  setTimeout(tick, 30_000)
  schedulerTimer = setInterval(tick, intervalMs)
  console.log(
    `[reminder] scheduler started — checking every ${env.reminder.schedulerIntervalMinutes} min`,
  )
}
