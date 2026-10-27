"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicBookingQrSchema = exports.qrAppointmentIdParamsSchema = exports.qrAppointmentBodySchema = exports.qrActivityQuerySchema = exports.qrCheckinBodySchema = exports.qrValidateBodySchema = void 0;
const zod_1 = require("zod");
exports.qrValidateBodySchema = zod_1.z
    .object({
    /** Raw QR payload (e.g. `sawaba:<token>`). */
    token: zod_1.z.string().trim().max(200).optional(),
    /** Human-readable booking reference for manual lookup. */
    reference: zod_1.z.string().trim().min(3).max(40).optional(),
})
    .refine((value) => Boolean(value.token) || Boolean(value.reference), {
    message: 'Provide a scanned QR code or a booking reference.',
});
exports.qrCheckinBodySchema = zod_1.z.object({
    appointmentId: zod_1.z.coerce.number().int().positive(),
    token: zod_1.z.string().trim().max(200).optional(),
});
exports.qrActivityQuerySchema = zod_1.z.object({
    outcome: zod_1.z.enum([
        'VALID',
        'PAYMENT_NOT_VERIFIED',
        'PAYMENT_MISMATCH',
        'NOT_FOUND',
        'REVOKED',
        'CANCELLED',
        'UNAUTHORIZED',
        'INVALID_TOKEN',
        'CHECKED_IN',
        'ALREADY_CHECKED_IN',
    ]).optional(),
    source: zod_1.z.enum(['QR', 'MANUAL', 'ADMIN']).optional(),
    barberId: zod_1.z.coerce.number().int().positive().optional(),
    appointmentId: zod_1.z.coerce.number().int().positive().optional(),
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
exports.qrAppointmentBodySchema = zod_1.z.object({
    appointmentId: zod_1.z.coerce.number().int().positive(),
});
exports.qrAppointmentIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive(),
});
/** Public (guest) QR retrieval — needs both the booking reference/id and phone. */
exports.publicBookingQrSchema = zod_1.z.object({
    reference: zod_1.z.string().trim().min(3).max(40),
    phone: zod_1.z.string().trim().min(7).max(30),
});
//# sourceMappingURL=qr.js.map