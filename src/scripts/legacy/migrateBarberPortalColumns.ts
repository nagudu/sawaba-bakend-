/**
 * Adds Barber Portal identity columns to `barbers`:
 *   password_hash  VARCHAR(255) NULL      — bcrypt hash, admin-issued
 *   portal_enabled TINYINT(1) NOT NULL 0  — whether the barber may sign in
 *
 * Idempotent — safe to run repeatedly. Other columns (barber_type, location,
 * commission_*, phone, email) already exist via prior migrations/sync.
 */
import { sequelize } from '../config/database'

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } },
  )
  return (rows as Array<{ COLUMN_NAME: string }>).length > 0
}

async function migrate(): Promise<void> {
  if (!(await columnExists('barbers', 'password_hash'))) {
    await sequelize.query('ALTER TABLE `barbers` ADD COLUMN `password_hash` VARCHAR(255) NULL AFTER `is_active`')
    console.log('✓ added barbers.password_hash')
  } else {
    console.log('· barbers.password_hash already present')
  }

  if (!(await columnExists('barbers', 'portal_enabled'))) {
    await sequelize.query('ALTER TABLE `barbers` ADD COLUMN `portal_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `password_hash`')
    console.log('✓ added barbers.portal_enabled')
  } else {
    console.log('· barbers.portal_enabled already present')
  }
}

migrate()
  .then(async () => {
    await sequelize.close()
    console.log('Barber portal columns migration complete.')
  })
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })