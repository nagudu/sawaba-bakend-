"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRemindersHandler = runRemindersHandler;
exports.adminRunRemindersHandler = adminRunRemindersHandler;
const env_1 = require("../config/env");
const reminderService_1 = require("../services/reminderService");
const response_1 = require("../utils/response");
/**
 * Authorises the scheduler endpoint. Vercel Cron sends the configured secret as
 * `Authorization: Bearer <CRON_SECRET>`. Without a configured secret the
 * endpoint stays available in development only (never in production).
 */
function isCronAuthorized(req) {
    const secret = env_1.env.reminder.cronSecret;
    if (!secret)
        return env_1.env.nodeEnv !== 'production';
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const querySecret = typeof req.query.secret === 'string' ? req.query.secret : '';
    return token === secret || querySecret === secret;
}
/** GET/POST /api/cron/appointment-reminders — invoked by Vercel Cron. */
async function runRemindersHandler(req, res, next) {
    if (!isCronAuthorized(req)) {
        res.status(401).json({ success: false, message: 'Unauthorized.' });
        return;
    }
    try {
        const dryRun = req.query.dryRun === 'true';
        const result = await (0, reminderService_1.sendAppointmentReminders)({ dryRun });
        (0, response_1.successRes)(res, dryRun ? 'Reminder preview.' : 'Appointment reminders processed.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
/** POST /api/admin/appointments/reminders/run — manual admin trigger for testing. */
async function adminRunRemindersHandler(req, res, next) {
    try {
        const dryRun = req.query.dryRun === 'true';
        const result = await (0, reminderService_1.sendAppointmentReminders)({ dryRun });
        (0, response_1.successRes)(res, dryRun ? 'Reminder preview.' : 'Reminders dispatched.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=reminderController.js.map