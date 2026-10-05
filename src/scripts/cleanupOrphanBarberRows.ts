import { sequelize } from '../config/database'
import { QueryTypes } from 'sequelize'

/**
 * One-off cleanup: deletes rows whose barber_id references a barber that no
 * longer exists. These orphans block `sequelize.sync({ alter: true })` from
 * re-validating foreign keys.
 */
async function run(): Promise<void> {
  await sequelize.authenticate()
  const tables = [
    'barber_availability',
    'barber_services',
    'gallery',
    'reviews',
    'appointments',
  ]
  for (const table of tables) {
    const [exists] = await sequelize.query(`SHOW TABLES LIKE '${table}'`, { type: QueryTypes.SELECT })
    if (!exists) continue
    const deleted = await sequelize.query(
      `DELETE \`${table}\` FROM \`${table}\`
       LEFT JOIN \`barbers\` ON \`barbers\`.\`id\` = \`${table}\`.\`barber_id\`
       WHERE \`${table}\`.\`barber_id\` IS NOT NULL AND \`barbers\`.\`id\` IS NULL`,
    )
    console.log(`[cleanup] ${table}: ${JSON.stringify(deleted[1])} orphan rows removed`)
  }
  await sequelize.close()
}

void run()
