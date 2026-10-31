import type { Prisma, CommissionType } from '@prisma/client'
import { prisma } from '../config/database'
import { UnprocessableError } from '../utils/errors'

/**
 * Marketplace configuration + commission engine.
 *
 * SECURITY INVARIANT (mirrors the barber commission engine): money is always
 * calculated on the backend from stored data. The browser only ever says
 * "here is my cart"; prices, stock and commission come from the database.
 *
 * Commission resolution — exactly ONE rule resolves per order line (priority):
 *   1. Vendor-specific override   (Vendor.commissionRate, percentage)
 *   2. Category-specific override (ProductCategory.commissionRate, percentage)
 *   3. Marketplace default       (MarketplaceSetting — percentage OR fixed ₦ fee)
 * A fixed default fee is never stacked on top of a percentage rule, so double
 * charging is structurally impossible.
 *
 * The resolved rate + amount are SNAPPED onto the order item and the ledger at
 * sale time; later settings changes never rewrite historical transactions.
 */

export interface CommissionBreakdown {
  commissionType: CommissionType
  commissionRate: number
  commissionAmount: number
  vendorNet: number
}

const round2 = (value: number): number => Math.round(value * 100) / 100

export function calculateLineCommission(
  rule: { type: CommissionType; rate: number },
  lineTotal: number,
): { commissionAmount: number; vendorNet: number } {
  const amount = Math.max(0, lineTotal)
  let commission = 0
  if (rule.type === 'PERCENTAGE') {
    const pct = Math.min(Math.max(rule.rate, 0), 100)
    commission = round2((amount * pct) / 100)
  } else {
    // Fixed ₦ fee per order line — clamped so it can never exceed the line.
    commission = Math.min(Math.max(rule.rate, 0), amount)
  }
  return { commissionAmount: commission, vendorNet: round2(amount - commission) }
}

/** The marketplace settings singleton (id = 1), created with defaults on first use. */
export async function getMarketplaceSettings(tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.marketplaceSetting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  })
}

export interface ResolveCommissionInput {
  vendorCommissionRate: Prisma.Decimal | number | null
  categoryCommissionRate: Prisma.Decimal | number | null
}

/**
 * Resolves the single applicable commission rule for one order line.
 * Priority: vendor override → category override → marketplace default.
 */
export async function resolveCommissionRule(
  input: ResolveCommissionInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ type: CommissionType; rate: number }> {
  if (input.vendorCommissionRate !== null && input.vendorCommissionRate !== undefined) {
    return { type: 'PERCENTAGE', rate: Number(input.vendorCommissionRate) }
  }
  if (input.categoryCommissionRate !== null && input.categoryCommissionRate !== undefined) {
    return { type: 'PERCENTAGE', rate: Number(input.categoryCommissionRate) }
  }
  const settings = await getMarketplaceSettings(tx)
  return { type: settings.commissionType, rate: Number(settings.defaultCommissionRate) }
}

/** Full breakdown for one line — resolves the rule and applies it. */
export async function computeLineCommission(
  input: ResolveCommissionInput & { lineTotal: number },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<CommissionBreakdown> {
  const rule = await resolveCommissionRule(input, tx)
  const { commissionAmount, vendorNet } = calculateLineCommission(rule, input.lineTotal)
  return {
    commissionType: rule.type,
    commissionRate: rule.rate,
    commissionAmount,
    vendorNet,
  }
}

/** Human-readable money for notifications (₦10,000.00 style). */
export function naira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function assertMarketplaceOpen(): void {
  // Placeholder hook for maintenance windows; settings row gates registration.
}

export async function requireVendorRegistrationOpen(): Promise<void> {
  const settings = await getMarketplaceSettings()
  if (!settings.vendorRegistrationOpen) {
    throw new UnprocessableError('Vendor registration is currently closed. Please check back later.')
  }
}
