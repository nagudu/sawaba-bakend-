import { sequelize } from '../config/database'
import '../models'
import { backfillCustomerCodes, backfillCustomerLinks } from '../services/customerService'

/**
 * One-off maintenance: normalizes customer phones, merges duplicate accounts,
 * links orphaned appointments/payments and stamps CUS-codes. Safe to re-run.
 * Usage: npm run db:backfill-customers
 */
async function run(): Promise<void> {
  await sequelize.authenticate()
  const links = await backfillCustomerLinks()
  const codes = await backfillCustomerCodes()
  console.log(
    `[db:backfill-customers] accounts=${links.customers} linkedAppointments=${links.appointments} newCodes=${codes}`,
  )
  await sequelize.close()
}

void run().catch((error) => {
  console.error('[db:backfill-customers] failed:', error)
  process.exit(1)
})
