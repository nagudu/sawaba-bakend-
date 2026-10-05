"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePaymentSettingsSchema = void 0;
const zod_1 = require("zod");
const payment_1 = require("./payment");
exports.updatePaymentSettingsSchema = zod_1.z.object({
    shopName: zod_1.z.string().trim().min(2).max(150).optional(),
    shopAddress: zod_1.z.string().trim().max(300).optional().nullable(),
    shopPhone: zod_1.z.string().trim().max(30).optional().nullable(),
    shopLogo: zod_1.z.string().trim().url('Logo must be a valid URL.').max(500).optional().nullable(),
    bankName: zod_1.z.string().trim().max(100).optional().nullable(),
    accountName: zod_1.z.string().trim().max(150).optional().nullable(),
    accountNumber: zod_1.z.string().trim().max(30).optional().nullable(),
    opayAccountName: zod_1.z.string().trim().max(150).optional().nullable(),
    opayAccountNumber: zod_1.z.string().trim().max(30).optional().nullable(),
    paymentInstructions: zod_1.z.string().trim().max(5000).optional().nullable(),
    enabledPaymentMethods: zod_1.z.array(zod_1.z.enum(payment_1.PAYMENT_METHODS)).max(8).optional(),
    minAmount: zod_1.z.coerce.number().min(0, 'Minimum amount cannot be negative.').optional(),
    fullPaymentRequired: zod_1.z.coerce.boolean().optional(),
    receiptRequired: zod_1.z.coerce.boolean().optional(),
});
//# sourceMappingURL=paymentSettings.js.map