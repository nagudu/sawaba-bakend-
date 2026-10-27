"use strict";
// GENERATED FILE — do not edit. Run: npm run db:field-types
// Source: prisma/schema.prisma
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATE_ONLY_FIELDS = exports.DECIMAL_SCALE = void 0;
/** Field name -> DECIMAL scale, so money serialises exactly as it does today. */
exports.DECIMAL_SCALE = {
    amount: 2,
    commissionAmount: 2,
    commissionRateSnapshot: 2,
    commissionValue: 2,
    minAmount: 2,
    price: 2,
    rating: 1,
    serviceAmount: 2,
    studioAmount: 2,
    totalAmount: 2,
};
/** Field names backed by MySQL DATE, which must serialise as "YYYY-MM-DD". */
exports.DATE_ONLY_FIELDS = new Set([
    'appointmentDate',
    'paymentDate',
]);
//# sourceMappingURL=prismaFieldTypes.js.map