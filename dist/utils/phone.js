"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeNigerianPhone = normalizeNigerianPhone;
exports.isPlausiblePhone = isPlausiblePhone;
exports.toE164 = toE164;
/**
 * Normalizes Nigerian phone numbers to their national 11-digit form so that
 * 08031234567, +2348031234567 and 2348031234567 all resolve to the same
 * customer. Everything non-numeric is stripped first; any other format is
 * returned digit-only so lookups never crash on odd input.
 */
function normalizeNigerianPhone(input) {
    let digits = (input ?? '').replace(/\D/g, '');
    if (digits.length > 4 && digits.startsWith('234')) {
        digits = `0${digits.slice(3)}`;
    }
    return digits;
}
function isPlausiblePhone(normalized) {
    return normalized.length >= 10 && normalized.length <= 13;
}
/**
 * Converts a normalized Nigerian number (e.g. 08031234567) into E.164 form
 * (+2348031234567) for SMS providers. Returns null for anything that cannot be
 * safely mapped so callers fall back to email delivery.
 */
function toE164(normalized) {
    const digits = (normalized ?? '').replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('234'))
        return `+${digits}`;
    if (digits.length === 11 && digits.startsWith('0'))
        return `+234${digits.slice(1)}`;
    if (digits.length === 10 && !digits.startsWith('0'))
        return `+234${digits}`;
    return null;
}
//# sourceMappingURL=phone.js.map