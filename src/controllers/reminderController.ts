import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env'
import { sendAppointmentReminders } from '../services/reminderService'
import { successRes } from '../utils/response'

/**
 * Authorises the scheduler endpoint. Vercel Cron sends the configured secret as
 * `Authorization: Bearer <CRON_SECRET>`. Without a configured secret the
 * endpoint stays available in development only (never in production).
 */
function isCronAuthorized(req: Request): boolean {
  const secret = env.reminder.cronSecret
  if (!secret) return env.nodeEnv !== 'production'
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : ''
  return token === secret || querySecret === secret
}

/** GET/POST /api/cron/appointment-reminders — invoked by Vercel Cron. */
export async function runRemindersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!isCronAuthorized(req)) {
    res.status(401).json({ success: false, message: 'Unauthorized.' })
    return
  }

  try {
    const dryRun = req.query.dryRun === 'true'
    const result = await sendAppointmentReminders({ dryRun })
    successRes(res, dryRun ? 'Reminder preview.' : 'Appointment reminders processed.', result, 200)
  } catch (error) {
    next(error)
  }
}

/** POST /api/admin/appointments/reminders/run — manual admin trigger for testing. */
export async function adminRunRemindersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dryRun = req.query.dryRun === 'true'
    const result = await sendAppointmentReminders({ dryRun })
    successRes(res, dryRun ? 'Reminder preview.' : 'Reminders dispatched.', result, 200)
  } catch (error) {
    next(error)
  }
}
