import { sequelize } from '../config/database'
import { QueryTypes } from 'sequelize'

async function migrate() {
  const cols = await sequelize.query<{ Column_name: string }>(
    `SHOW COLUMNS FROM appointments`,
    { type: QueryTypes.SELECT },
  )
  const existing = new Set(cols.map((c) => c.Column_name))

  const additions: Array<{ name: string; def: string }> = [
    { name: 'serviceStartedAt', def: 'ADD COLUMN `service_started_at` DATETIME NULL' },
    { name: 'completedAt', def: 'ADD COLUMN `completed_at` DATETIME NULL' },
    { name: 'cancelledAt', def: 'ADD COLUMN `cancelled_at` DATETIME NULL' },
    { name: 'cancellationReason', def: 'ADD COLUMN `cancellation_reason` TEXT NULL' },
    { name: 'cancelledBy', def: 'ADD COLUMN `cancelled_by` INT UNSIGNED NULL' },
  ]

  for (const { name, def } of additions) {
    const snake = name.replace(/([A-Z])/g, '_$1').toLowerCase()
    if (!existing.has(snake)) {
      await sequelize.query(`ALTER TABLE appointments ${def}`)
      console.log(`  Added ${snake}`)
    } else {
      console.log(`  ${snake} already exists, skipping`)
    }
  }

  console.log('Migration complete.')
  await sequelize.close()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
