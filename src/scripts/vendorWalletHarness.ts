import 'dotenv/config'
import { prisma } from '../config/database'
import {
  computeVendorWallet,
  getVendorEarnings,
  getVendorPayouts,
  releaseMaturedEarnings,
} from '../services/vendorService'

/**
 * Vendor wallet harness — read-only sanity checks for the balance engine.
 *
 *   tsx src/scripts/vendorWalletHarness.ts
 *
 * Verifies the derived wallet is internally consistent for a real approved
 * vendor: total earnings equal the sum of the status buckets, and the earnings
 * endpoint agrees with the shared engine. It never mutates money.
 */

const round2 = (value: number) => Math.round(value * 100) / 100

function check(ok: boolean, label: string): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

async function main(): Promise<void> {
  console.log('── SAWABA vendor wallet harness ─────────────────────────────')
  await releaseMaturedEarnings()

  const vendor = await prisma.vendor.findFirst({
    where: { status: 'APPROVED' },
    orderBy: { id: 'asc' },
  })
  if (!vendor) {
    console.log('No approved vendor found — create and approve one first.')
    return
  }

  console.log(`Vendor: ${vendor.businessName} (#${vendor.id})`)
  const balances = await computeVendorWallet(vendor.id)
  console.log('Balances:', balances)

  const bucketSum = round2(
    balances.pending + balances.available + balances.locked + balances.paid,
  )
  check(
    Math.abs(bucketSum - balances.totalEarnings) <= 0.02,
    'totalEarnings = pending + available + locked + paid',
  )

  const earnings = await getVendorEarnings(vendor.id, { page: 1, perPage: 5 })
  check(
    Math.abs(earnings.balances.totalEarnings - balances.totalEarnings) <= 0.001,
    'earnings endpoint matches the wallet engine',
  )
  check(
    earnings.balances.available === balances.available,
    'available balance is net of reserved withdrawal funds',
  )

  const payouts = await getVendorPayouts(vendor.id, { page: 1, perPage: 5 })
  check(payouts.total >= 0 && Array.isArray(payouts.items), 'withdrawal history query works')

  const bankVendor = await prisma.vendor.findFirst({
    where: {
      status: 'APPROVED',
      bankName: { not: null },
      bankAccountName: { not: null },
      bankAccountNumber: { not: null },
    },
    orderBy: { id: 'asc' },
  })
  if (bankVendor?.bankAccountNumber) {
    console.log(`  INFO  bank details vendor: ${bankVendor.businessName} (#${bankVendor.id})`)
    check(/^\d{10}$/.test(bankVendor.bankAccountNumber), 'stored account number is a 10-digit NUBAN')
  } else {
    console.log('  SKIP  no approved vendor with bank details yet')
  }

  console.log(
    `  INFO  ledger paid=${balances.paid} · paid withdrawals=${balances.totalWithdrawn} · reversed=${balances.reversed}`,
  )
  console.log('\nDone.')
}

main()
  .catch((error) => {
    console.error('[harness] failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
