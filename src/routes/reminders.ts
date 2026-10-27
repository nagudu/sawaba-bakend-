import { Router } from 'express'
import {
  adminRunRemindersHandler,
  runRemindersHandler,
} from '../controllers/reminderController'
import { requireAdmin } from '../middleware/auth'

/**
 * Scheduler endpoint for automatic appointment reminders.
 *
 * Mounted at `/api/cron`, deliberately OUTSIDE the admin/barber namespaces so
 * the Vercel Cron (and long-lived-host scheduler) can call it without a user
 * session — it is protected by CRON_SECRET instead.
 */
export const cronRouter = Router()

/**
 * @swagger
 * /api/cron/appointment-reminders:
 *   get:
 *     tags: [Cron]
 *     summary: Send due appointment reminders (scheduler)
 *     description: Emails or texts every customer whose appointment is within a configured reminder window (default 24h and 1h). Authorised with `Authorization: Bearer <CRON_SECRET>`.
 *     responses:
 *       200:
 *         description: Reminder run summary.
 *       401:
 *         description: Missing or invalid cron secret.
 */
cronRouter.get('/appointment-reminders', runRemindersHandler)
cronRouter.post('/appointment-reminders', runRemindersHandler)

/**
 * Manual trigger so an administrator can dispatch due reminders on demand
 * (e.g. after a server outage) without waiting for the next scheduled tick.
 */
export const adminRemindersRouter = Router()

adminRemindersRouter.post('/run', requireAdmin, adminRunRemindersHandler)
