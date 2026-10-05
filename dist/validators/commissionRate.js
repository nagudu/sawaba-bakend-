"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commissionRateUpdateSchema = exports.commissionRateHistorySchema = exports.commissionRateListSchema = void 0;
const zod_1 = require("zod");
exports.commissionRateListSchema = zod_1.z.object({
    barberId: zod_1.z.coerce.number().int().positive().optional(),
    commissionType: zod_1.z.enum(['PERCENTAGE', 'FIXED']).optional(),
    search: zod_1.z.string().trim().optional(),
    page: zod_1.z.coerce.number().int().positive().optional(),
    perPage: zod_1.z.coerce.number().int().positive().max(100).optional(),
});
exports.commissionRateHistorySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    perPage: zod_1.z.coerce.number().int().positive().max(100).optional(),
});
exports.commissionRateUpdateSchema = zod_1.z
    .object({
    commissionType: zod_1.z.enum(['PERCENTAGE', 'FIXED']).optional(),
    commissionValue: zod_1.z.coerce.number().min(0).optional(),
    effectiveFrom: zod_1.z.coerce.date().optional(),
})
    .refine((v) => v.commissionType !== undefined || v.commissionValue !== undefined, { message: 'Provide either commissionType or commissionValue to update the rate.' })
    .refine(
// FIXED commissions are naira amounts (can exceed 100); only PERCENTAGE is capped.
(v) => v.commissionType !== 'PERCENTAGE' || v.commissionValue === undefined || v.commissionValue <= 100, { message: 'Percentage commission must be between 0 and 100.' });
//# sourceMappingURL=commissionRate.js.map