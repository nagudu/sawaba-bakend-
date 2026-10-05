"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paystackVerifySchema = exports.cashConfirmSchema = exports.rejectPaymentSchema = exports.listPaymentsQuerySchema = exports.trackPaymentSchema = exports.submitPaymentSchema = exports.paymentIdParamsSchema = exports.paymentTokenParamsSchema = exports.PAYMENT_METHODS = void 0;
const zod_1 = require("zod");
exports.PAYMENT_METHODS = ['OPAY', 'BANK_TRANSFER', 'CASH', 'OTHER'];
exports.paymentTokenParamsSchema = zod_1.z.object({
    token: zod_1.z.string().trim().min(16).max(64),
});
exports.paymentIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('Payment id must be a positive integer.'),
});
exports.submitPaymentSchema = zod_1.z.object({
    paymentMethod: zod_1.z.enum(exports.PAYMENT_METHODS),
    amountPaid: zod_1.z.coerce.number().min(0, 'Amount paid cannot be negative.'),
    transactionReference: zod_1.z.string().trim().max(191).optional().default(''),
    paymentDate: zod_1.z.string().date('Provide a valid payment date (YYYY-MM-DD).'),
    note: zod_1.z.string().trim().max(1000).optional().nullable(),
});
exports.trackPaymentSchema = zod_1.z.object({
    appointmentId: zod_1.z
        .string()
        .trim()
        .min(2, 'Provide a valid appointment ID.')
        .max(30, 'Provide a valid appointment ID.'),
    phone: zod_1.z.string().trim().min(7).max(30),
});
exports.listPaymentsQuerySchema = zod_1.z.object({
    status: zod_1.z
        .enum(['UNPAID', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'REFUNDED', 'CANCELLED'])
        .optional(),
    method: zod_1.z.enum(exports.PAYMENT_METHODS).optional(),
    from: zod_1.z.string().date('Provide a valid from date (YYYY-MM-DD).').optional(),
    to: zod_1.z.string().date('Provide a valid to date (YYYY-MM-DD).').optional(),
    search: zod_1.z.string().trim().max(150).optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
exports.rejectPaymentSchema = zod_1.z.object({
    reason: zod_1.z
        .string()
        .trim()
        .min(5, 'Please provide a reason for rejecting this payment.')
        .max(1000),
});
exports.cashConfirmSchema = zod_1.z.object({
    note: zod_1.z.string().trim().max(1000).optional().nullable(),
});
exports.paystackVerifySchema = zod_1.z.object({
    reference: zod_1.z.string().trim().min(4).max(191),
});
//# sourceMappingURL=payment.js.map