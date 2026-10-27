"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGoogleAuthEnabled = exports.env = void 0;
require("dotenv/config");
function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function parseCloudinaryUrl(urlStr) {
    if (!urlStr || !urlStr.startsWith('cloudinary://'))
        return {};
    try {
        const url = new URL(urlStr);
        return {
            cloudName: url.hostname || undefined,
            apiKey: decodeURIComponent(url.username) || undefined,
            apiSecret: decodeURIComponent(url.password) || undefined,
        };
    }
    catch {
        return {};
    }
}
const parsedCloudinary = parseCloudinaryUrl(process.env.CLOUDINARY_URL);
exports.env = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    // `Number(x) || 5001` guards against inherited junk like PORT='' or PORT=0
    // (e.g. exported by a parent shell) silently binding the server to port 0.
    port: Number(process.env.PORT) || 5001,
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
    clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
    // Extra allowed browser origins (comma-separated) — e.g. the deployed
    // frontend plus preview domains. Keep it minimal in production.
    extraClientOrigins: (process.env.EXTRA_CLIENT_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    // Cloudinary credentials for cloud image uploads (required on Vercel).
    // Supports either individual keys or a single CLOUDINARY_URL connection string.
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? parsedCloudinary.cloudName ?? '',
        apiKey: process.env.CLOUDINARY_API_KEY ?? parsedCloudinary.apiKey ?? '',
        apiSecret: process.env.CLOUDINARY_API_SECRET ?? parsedCloudinary.apiSecret ?? '',
        uploadFolder: process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'sawaba-salon',
    },
    adminSeed: {
        email: process.env.ADMIN_SEED_EMAIL ?? 'admin@sawabasalon.com',
        password: process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe123!',
        name: process.env.ADMIN_SEED_NAME ?? 'SAWABA Admin',
    },
    // Google Identity Services. Deliberately OPTIONAL: when the client id is
    // missing the server still boots and email/password + phone-OTP login keep
    // working — the "Continue with Google" button is simply not offered.
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    },
    // SMS delivery for OTPs (Termii-compatible). Deliberately OPTIONAL: when the
    // key or sender id is missing, OTPs fall back to email delivery.
    sms: {
        apiKey: process.env.SMS_API_KEY ?? '',
        senderId: process.env.SMS_SENDER_ID ?? '',
        baseUrl: process.env.SMS_BASE_URL ?? '',
    },
    // Automatic appointment reminders.
    //   cronSecret            — shared secret that authorises the scheduler
    //                           endpoint (Vercel sends it as a Bearer token).
    //   nowHoursBefore        — comma-separated reminder windows, in hours
    //                           before the appointment (default 24 and 1).
    //   timezoneOffsetMinutes — offset of the studio's wall clock from UTC
    //                           (Nigeria / WAT = +60). Used to convert the
    //                           stored local date+time into a real instant.
    reminder: {
        cronSecret: process.env.CRON_SECRET ?? '',
        hoursBefore: (process.env.REMINDER_HOURS_BEFORE ?? '24,1')
            .split(',')
            .map((h) => Number(h.trim()))
            .filter((h) => Number.isFinite(h) && h > 0)
            .sort((a, b) => b - a),
        timezoneOffsetMinutes: Number(process.env.REMINDER_TZ_OFFSET_MINUTES) || 60,
        // Interval (minutes) for the in-process scheduler on long-lived hosts.
        schedulerIntervalMinutes: Number(process.env.REMINDER_INTERVAL_MINUTES) || 15,
    },
};
/** True when Google sign-in is usable end to end. */
const isGoogleAuthEnabled = () => exports.env.google.clientId.trim().length > 0;
exports.isGoogleAuthEnabled = isGoogleAuthEnabled;
//# sourceMappingURL=env.js.map