/**
 * Removes ONLY the QA customer records created by scripts/guest-booking-identity-test.mjs
 * (matched by their synthetic phone numbers). Real customers are never touched.
 *
 * Run from backend/: npx tsx src/scripts/qaIdentityCleanup.ts
 */
import { prisma } from '../config/database'

const QA_PHONES = ['09160000007', '09160000008', '09160000009', '09160000010', '09160000011']

async function main() {
  // Appointments first (optional FK would otherwise just null out).
  const apts = await prisma.appointment.deleteMany({ where: { customerPhone: { in: QA_PHONES } } })
  const gone = await prisma.customer.deleteMany({ where: { phone: { in: QA_PHONES } } })
  console.log(`removed ${apts.count} QA appointments, ${gone.count} QA customer records`)
}

main()
  .catch((error) => {
    console.error('QA cleanup failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
