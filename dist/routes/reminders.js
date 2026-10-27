"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRemindersRouter = exports.cronRouter = void 0;
const express_1 = require("express");
const reminderController_1 = require("../controllers/reminderController");
const auth_1 = require("../middleware/auth");
/**
 * Scheduler endpoint for automatic appointment reminders.
 *
 * Mounted at `/api/cron`, deliberately OUTSIDE the admin/barber namespaces so
 * the Vercel Cron (and long-lived-host scheduler) can call it without a user
 * session — it is protected by CRON_SECRET instead.
 */
exports.cronRouter = (0, express_1.Router)();
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
exports.cronRouter.get('/appointment-reminders', reminderController_1.runRemindersHandler);
exports.cronRouter.post('/appointment-reminders', reminderController_1.runRemindersHandler);
/**
 * Manual trigger so an administrator can dispatch due reminders on demand
 * (e.g. after a server outage) without waiting for the next scheduled tick.
 */
exports.adminRemindersRouter = (0, express_1.Router)();
exports.adminRemindersRouter.post('/run', auth_1.requireAdmin, reminderController_1.adminRunRemindersHandler);
//# sourceMappingURL=reminders.js.map