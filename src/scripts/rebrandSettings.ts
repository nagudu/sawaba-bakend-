/* One-off: rebrand the live payment_settings row from "Salon" to "Studio".
 * Run: cd backend && npx tsx src/scripts/rebrandSettings.ts
 */
import { PaymentSetting } from '../models'
import { sequelize } from '../config/database'

async function run(): Promise<void> {
  await sequelize.authenticate()
  const settings = await PaymentSetting.findByPk(1)
  if (!settings) {
    console.log('[rebrand] no payment_settings row found — nothing to do')
    return
  }
  const updates: Record<string, string> = {}
  for (const field of ['shopName', 'accountName', 'opayAccountName'] as const) {
    const current = settings.get(field)
    if (typeof current === 'string' && current.includes('Grooming Salon')) {
      updates[field] = current.replace(/Grooming Salon/g, 'Grooming Studio')
    }
  }
  if (Object.keys(updates).length === 0) {
    console.log('[rebrand] settings already use "Grooming Studio" — nothing to do')
    return
  }
  await settings.update(updates)
  console.log('[rebrand] updated fields:', Object.keys(updates).join(', '))
  await sequelize.close()
}

run().catch((error) => {
  console.error('[rebrand] failed:', (error as Error).message)
  process.exit(1)
})
