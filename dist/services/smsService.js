"use strict";
/**
 * SMS delivery adapter (Termii-compatible Send Message API), configured
 * exclusively from environment variables:
 *
 *   SMS_API_KEY     — Termii (or compatible) API key.  Required to enable SMS.
 *   SMS_SENDER_ID   — alphanumeric sender id shown to recipients.
 *   SMS_BASE_URL    — override the default Termii base URL (optional).
 *
 * Like the mailer, this module NEVER pretends to succeed: nothing configured
 * (or a rejected/unsendable request) throws SmsDeliveryError whose user-safe
 * message the OTP flows surface to the caller. The SMS body (which contains
 * the one-time code) is never written to logs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmsDeliveryError = void 0;
exports.isSmsConfigured = isSmsConfigured;
exports.sendSms = sendSms;
const DEFAULT_SMS_BASE_URL = 'https://api.ng.termii.com';
/** Error carrying a user-safe message; the raw cause stays in server logs only. */
class SmsDeliveryError extends Error {
    userMessage;
    constructor(userMessage, cause) {
        super(userMessage);
        this.name = 'SmsDeliveryError';
        this.userMessage = userMessage;
        if (cause instanceof Error)
            this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
}
exports.SmsDeliveryError = SmsDeliveryError;
/** True when SMS delivery is fully configured (key + sender id). */
function isSmsConfigured() {
    return Boolean(process.env.SMS_API_KEY && process.env.SMS_SENDER_ID);
}
function smsBase() {
    return (process.env.SMS_BASE_URL || DEFAULT_SMS_BASE_URL).replace(/\/+$/, '');
}
/**
 * Sends an OTP message to a phone number in E.164 form (e.g. +2348012345678).
 * The message body is intentionally NOT logged.
 */
async function sendSms(toE164, message) {
    if (!isSmsConfigured()) {
        throw new SmsDeliveryError('SMS service is not configured. Please contact the administrator.');
    }
    const to = toE164.replace(/[^\d]/g, '').replace(/^234/, '').replace(/^0/, '');
    const payload = {
        api_key: process.env.SMS_API_KEY,
        to: `234${to}`,
        from: process.env.SMS_SENDER_ID,
        sms: message,
        channel: 'generic',
        type: 'plain',
    };
    let response;
    try {
        response = await fetch(`${smsBase()}/api/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }
    catch {
        throw new SmsDeliveryError('Unable to connect to the SMS provider. Please try again in a moment.');
    }
    const json = (await response.json().catch(() => null));
    if (!response.ok || !json?.message_id) {
        console.error(`[sms] provider rejected the send (status ${response.status}):`, json?.message ?? response.statusText);
        throw new SmsDeliveryError('The SMS provider rejected this message. Please try again in a moment.');
    }
    console.log(`[sms] delivered to ${toE164} | messageId=${json.message_id ?? 'n/a'}`);
    return {
        provider: 'termii',
        messageId: json.message_id ?? undefined,
        response: json.message ?? json.message_id ?? 'accepted',
    };
}
//# sourceMappingURL=smsService.js.map