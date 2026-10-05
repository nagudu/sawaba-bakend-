"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeNigerianPhone = normalizeNigerianPhone;
exports.isPlausiblePhone = isPlausiblePhone;
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
//# sourceMappingURL=phone.js.map