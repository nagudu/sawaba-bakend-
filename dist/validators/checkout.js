"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkoutVerifySchema = exports.sessionTokenParamsSchema = exports.createCheckoutSchema = void 0;
const zod_1 = require("zod");
const appointment_1 = require("./appointment");
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
/**
 * Creating the checkout SESSION is not booking — it only stages the payment
 * step. It deliberately requires paymentMethod so the payment condition is
 * explicit from the start.
 */
exports.createCheckoutSchema = zod_1.z.object({
    customerName: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
    customerPhone: zod_1.z.string().trim().regex(PHONE_PATTERN, 'Provide a valid phone number.'),
    customerEmail: zod_1.z
        .string()
        .trim()
        .toLowerCase()
        .email('Provide a valid email address.')
        .optional()
        .nullable()
        .or(zod_1.z.literal('')),
    serviceId: zod_1.z.coerce.number().int().positive('A valid service is required.'),
    barberId: zod_1.z.coerce.number().int().positive('A valid barber is required.'),
    /** Customer's location/area — optional, admin-assignment context only. */
    customerLocation: zod_1.z
        .string()
        .trim()
        .max(150)
        .optional()
        .nullable()
        .or(zod_1.z.literal('')),
    appointmentDate: zod_1.z.string().date('Provide a valid date (YYYY-MM-DD).'),
    appointmentTime: zod_1.z.string().regex(TIME_PATTERN, 'Provide a valid time in HH:mm format.'),
    notes: zod_1.z.string().trim().max(2000).optional().nullable().or(zod_1.z.literal('')),
    paymentMethod: zod_1.z.enum(appointment_1.BOOKING_PAYMENT_METHODS, {
        errorMap: () => ({ message: 'Payment method is required.' }),
    }),
    transactionReference: zod_1.z.string().trim().max(191).optional().default(''),
});
exports.sessionTokenParamsSchema = zod_1.z.object({
    sessionToken: zod_1.z.string().trim().min(16).max(64),
});
exports.checkoutVerifySchema = zod_1.z.object({
    reference: zod_1.z.string().trim().min(4).max(191),
});
//# sourceMappingURL=checkout.js.map