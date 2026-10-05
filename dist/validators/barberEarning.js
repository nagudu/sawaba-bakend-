"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markPaidSchema = exports.earningsQuerySchema = exports.assignBarberParamsSchema = exports.assignBarberSchema = void 0;
const zod_1 = require("zod");
const appointment_1 = require("./appointment");
/**
 * Admin barber assignment. `barberId: null` removes the assignment (falls
 * back to the customer's booked barber). `reason` feeds the audit trail.
 */
exports.assignBarberSchema = zod_1.z.object({
    barberId: zod_1.z.coerce.number().int().positive().nullable(),
    reason: zod_1.z.string().trim().max(300).optional().nullable().or(zod_1.z.literal('')),
});
exports.assignBarberParamsSchema = appointment_1.idParamsSchema;
/** Earnings list filters. */
exports.earningsQuerySchema = zod_1.z.object({
    barberId: zod_1.z.coerce.number().int().positive().optional(),
    barberType: zod_1.z.enum(['INTERNAL', 'EXTERNAL']).optional(),
    status: zod_1.z.enum(['PENDING', 'EARNED', 'PAID', 'CANCELLED']).optional(),
    location: zod_1.z.string().trim().max(150).optional(),
    appointmentRef: zod_1.z.string().trim().max(30).optional(),
    from: zod_1.z.string().date().optional(),
    to: zod_1.z.string().date().optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
exports.markPaidSchema = zod_1.z.object({
    note: zod_1.z.string().trim().max(300).optional().nullable().or(zod_1.z.literal('')),
});
//# sourceMappingURL=barberEarning.js.map