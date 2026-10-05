import { QueryTypes } from 'sequelize'
import { sequelize } from '../config/database'

/**
 * LEGACY / DISABLED BY DEFAULT.
 *
 * This used to delete rows whose barber_id references a missing barber. It only
 * existed to unblock `sequelize.sync({ alter: true })`, which has since been
 * removed from db:sync — schema changes now go through Prisma migrations.
 *
 * It is kept only as a record, and it caused real data loss: it DELETEs from
 * `appointments`, and a run left `barber_earnings` pointing at an appointment
 * that no longer existed, even though that FK is ON DELETE CASCADE (the
 * constraint had been dropped, so nothing cascaded).
 *
 * It now reports what it *would* delete and refuses to write without --confirm.
 */
const TABLES = [
  'barber_availability',
  'barber_services',
  'gallery',
  'reviews',
  'appointments',
]

async function run(): Promise<void> {
  const confirm = process.argv.includes('--confirm')
  if (!confirm) {
    console.log('[cleanup] DRY RUN — pass --confirm to actually delete. Nothing was changed.')
  }

  await sequelize.authenticate()
  let total = 0

  for (const table of TABLES) {
    const [exists] = await sequelize.query(`SHOW TABLES LIKE '${table}'`, { type: QueryTypes.SELECT })
    if (!exists) continue

    const select = `SELECT \`${table}\`.\`id\`
                        FROM \`${table}\`
                        LEFT JOIN \`barbers\` ON \`barbers\`.\`id\` = \`${table}\`.\`barber_id\`
                       WHERE \`${table}\`.\`barber_id\` IS NOT NULL AND \`barbers\`.\`id\` IS NULL`
    const rows = (await sequelize.query(select, { type: QueryTypes.SELECT })) as unknown as Array<{ id: number }>
    if (!rows.length) {
      console.log(`[cleanup] ${table}: 0 orphan rows`)
      continue
    }

    if (!confirm) {
      console.log(`[cleanup] ${table}: ${rows.length} orphan row(s) would be DELETED — ids ${rows.map((r) => r.id).join(', ')}`)
      total += rows.length
      continue
    }

    const ids = rows.map((r) => r.id)
    await sequelize.query(`DELETE FROM \`${table}\` WHERE \`id\` IN (${ids.map(() => '?').join(',')})`, {
      replacements: ids,
    })
    console.log(`[cleanup] ${table}: deleted ${rows.length} orphan row(s) — ids ${ids.join(', ')}`)
    total += rows.length
  }

  if (!confirm && total > 0) console.log(`\n[cleanup] ${total} row(s) would be deleted. Re-run with --confirm to proceed.`)
  await sequelize.close()
}

void run()
