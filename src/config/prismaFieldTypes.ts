// GENERATED FILE — do not edit. Run: npm run db:field-types
// Source: prisma/schema.prisma

/** Field name -> DECIMAL scale, so money serialises exactly as it does today. */
export const DECIMAL_SCALE: Readonly<Record<string, number>> = {
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
}

/** Field names backed by MySQL DATE, which must serialise as "YYYY-MM-DD". */
export const DATE_ONLY_FIELDS: ReadonlySet<string> = new Set([
  'appointmentDate',
  'paymentDate',
])
