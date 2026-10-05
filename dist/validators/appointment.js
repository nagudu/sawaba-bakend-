"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availabilityQuerySchema = exports.listAppointmentsQuerySchema = exports.appointmentStatusSchema = exports.updateAppointmentSchema = exports.createAppointmentSchema = exports.BOOKING_PAYMENT_METHODS = exports.idParamsSchema = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
exports.idParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('Id must be a positive integer.'),
}); /** Methods a customer may choose at booking time. ONLINE means Paystack checkout. */
exports.BOOKING_PAYMENT_METHODS = ['OPAY', 'BANK_TRANSFER', 'CASH', 'OTHER', 'ONLINE'];
/** Multipart fields arrive as strings — empty ones must become undefined, not ''. */
const emptyToUndefined = (value) => (value === '' ? undefined : value);
exports.createAppointmentSchema = zod_1.z
    .object({
    customerName: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
    customerPhone: zod_1.z
        .string()
        .trim()
        .regex(PHONE_PATTERN, 'Provide a valid phone number.'),
    customerEmail: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().trim().toLowerCase().email('Provide a valid email address.').optional().nullable()),
    /** Customer's location/area — optional context that helps admin choose the right barber. Never auto-assigns. */
    customerLocation: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().trim().max(150).optional().nullable().or(zod_1.z.literal(''))),
    serviceId: zod_1.z.coerce.number().int().positive('A valid service is required.'),
    barberId: zod_1.z.coerce.number().int().positive('A valid barber is required.'),
    appointmentDate: zod_1.z.string().date('Provide a valid date (YYYY-MM-DD).'),
    appointmentTime: zod_1.z
        .string()
        .regex(TIME_PATTERN, 'Provide a valid time in HH:mm format.'),
    notes: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().trim().max(2000).optional().nullable()),
    // Payment rules are enforced in the service layer (enabled-methods check +
    // mandatory receipt for non-cash, non-online methods).
    paymentMethod: zod_1.z.enum(exports.BOOKING_PAYMENT_METHODS, {
        errorMap: () => ({ message: 'Choose a payment method to submit your appointment.' }),
    }),
    transactionReference: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().trim().max(191).optional().default('')),
})
    .superRefine((data, ctx) => {
    const selected = new Date(`${data.appointmentDate}T${data.appointmentTime}:00`);
    if (Number.isNaN(selected.getTime())) {
        ctx.addIssue({ code: 'custom', path: ['appointmentDate'], message: 'Provide a valid date.' });
        return;
    }
    // Compare date-only (YYYY-MM-DD) so timezone differences between the
    // browser and server never cause a valid same-day booking to be rejected.
    // Slot-level conflict checks (including time-in-the-past) are handled in
    // the service layer where we have full context.
    const todayISO = new Date().toISOString().slice(0, 10);
    if (data.appointmentDate < todayISO) {
        ctx.addIssue({
            code: 'custom',
            path: ['appointmentDate'],
            message: 'Appointments cannot be booked in the past.',
        });
    }
});
exports.updateAppointmentSchema = zod_1.z
    .object({
    customerName: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150).optional(),
    customerPhone: zod_1.z.string().trim().regex(PHONE_PATTERN, 'Provide a valid phone number.').optional(),
    customerEmail: zod_1.z.string().trim().toLowerCase().email('Provide a valid email address.').optional().nullable(),
    customerLocation: zod_1.z.string().trim().max(150).optional().nullable(),
    serviceId: zod_1.z.coerce.number().int().positive('A valid service is required.').optional(),
    /** Admin-only reassignment via PATCH /appointments/:id. Never accepted from customers. */
    barberId: zod_1.z.coerce.number().int().positive('A valid barber is required.').optional(),
    appointmentDate: zod_1.z.string().date('Provide a valid date (YYYY-MM-DD).').optional(),
    appointmentTime: zod_1.z.string().regex(TIME_PATTERN, 'Provide a valid time in HH:mm format.').optional(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
})
    .superRefine((data, ctx) => {
    if (data.appointmentDate && data.appointmentTime) {
        const selected = new Date(`${data.appointmentDate}T${data.appointmentTime}:00`);
        if (Number.isNaN(selected.getTime())) {
            ctx.addIssue({ code: 'custom', path: ['appointmentDate'], message: 'Provide a valid date.' });
            return;
        }
        const todayISO = new Date().toISOString().slice(0, 10);
        if (data.appointmentDate < todayISO) {
            ctx.addIssue({
                code: 'custom',
                path: ['appointmentDate'],
                message: 'Appointments cannot be booked in the past.',
            });
        }
    }
});
const statusEnum = zod_1.z.enum(types_1.APPOINTMENT_STATUSES);
exports.appointmentStatusSchema = zod_1.z.object({
    status: statusEnum,
    cancellationReason: zod_1.z.string().trim().max(500).optional().nullable(),
});
exports.listAppointmentsQuerySchema = zod_1.z.object({
    status: statusEnum.optional(),
    barberId: zod_1.z.coerce.number().int().positive().optional(),
    serviceId: zod_1.z.coerce.number().int().positive().optional(),
    from: zod_1.z.string().date('Provide a valid from date (YYYY-MM-DD).').optional(),
    to: zod_1.z.string().date('Provide a valid to date (YYYY-MM-DD).').optional(),
    search: zod_1.z.string().trim().max(150).optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
exports.availabilityQuerySchema = zod_1.z.object({
    barberId: zod_1.z.coerce.number().int().positive('A valid barber id is required.'),
    date: zod_1.z.string().date('Provide a valid date (YYYY-MM-DD).'),
});
//# sourceMappingURL=appointment.js.map