"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.barberAvailabilityBodySchema = exports.barberAvailabilityInputSchema = exports.barberMarkNotificationReadSchema = exports.barberAppointmentTimeParamsSchema = exports.barberPortalQuerySchema = void 0;
const zod_1 = require("zod");
exports.barberPortalQuerySchema = zod_1.z.object({
    /** Appointment date bounds (YYYY-MM-DD — matches appointmentDate column). */
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
    status: zod_1.z
        .enum([
        'PAYMENT_REQUIRED',
        'PAYMENT_SUBMITTED',
        'PAYMENT_VERIFIED',
        'PAYMENT_REJECTED',
        'READY_FOR_SERVICE',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
    ])
        .optional(),
    /** Ledger filter for the earnings list (PENDING → EARNED → PAID lifecycle). */
    earningStatus: zod_1.z.enum(['PENDING', 'EARNED', 'PAID', 'CANCELLED']).optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
exports.barberAppointmentTimeParamsSchema = zod_1.z.object({
    appointmentId: zod_1.z.coerce.number().int().positive(),
});
exports.barberMarkNotificationReadSchema = zod_1.z.object({
    /** Marks ALL notifications read when omitted. */
    notificationId: zod_1.z.coerce.number().int().positive().optional(),
});
exports.barberAvailabilityInputSchema = zod_1.z.object({
    dayOfWeek: zod_1.z.coerce.number().int().min(0).max(6),
    startTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm.'),
    endTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm.'),
    isAvailable: zod_1.z.boolean({ required_error: 'isAvailable is required.' }),
});
/** The portal saves a whole weekly schedule in one PUT, so the body is a list of entries. A single entry stays accepted for backwards compatibility. */
exports.barberAvailabilityBodySchema = zod_1.z.union([exports.barberAvailabilityInputSchema, zod_1.z.array(exports.barberAvailabilityInputSchema)]);
//# sourceMappingURL=barberPortal.js.map