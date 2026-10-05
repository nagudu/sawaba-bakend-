import { sequelize } from '../config/database'
import { QueryTypes } from 'sequelize'

/**
 * Adds `barber_id` to `reviews` so reviews can belong to a barber as well as
 * a service. Idempotent — safe to run multiple times. Backfills nothing:
 * historical reviews genuinely have no barber attribution.
 */
async function migrate() {
  const cols = await sequelize.query<{ Field: string }>(
    'SHOW COLUMNS FROM reviews',
    { type: QueryTypes.SELECT },
  )
  const existing = new Set(cols.map((c) => c.Field))

  if (!existing.has('barber_id')) {
    await sequelize.query(
      'ALTER TABLE reviews ADD COLUMN `barber_id` INT UNSIGNED NULL AFTER `service_name`',
    )
    console.log('  Added barber_id')
  } else {
    console.log('  barber_id already exists, skipping')
  }

  const indexes = await sequelize.query<{ Key_name: string }>(
    'SHOW INDEX FROM reviews',
    { type: QueryTypes.SELECT },
  )
  const indexNames = new Set(indexes.map((i) => i.Key_name))
  if (!indexNames.has('index_reviews_barber_id')) {
    await sequelize.query(
      'ALTER TABLE reviews ADD INDEX index_reviews_barber_id (`barber_id`)',
    )
    console.log('  Added index on barber_id')
  } else {
    console.log('  index_reviews_barber_id already exists, skipping')
  }

  console.log('Migration complete.')
  await sequelize.close()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
