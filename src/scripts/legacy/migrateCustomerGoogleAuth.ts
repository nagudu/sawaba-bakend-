import { QueryTypes } from 'sequelize'
import { sequelize } from '../config/database'

/**
 * Adds the Google sign-in columns to `customers`:
 *   - google_sub     VARCHAR(255) NULL UNIQUE  (Google's stable `sub` claim)
 *   - phone_verified BOOLEAN NOT NULL DEFAULT 1 (0 = Google-created, no phone yet)
 *
 * Idempotent: safe to run more than once.
 */
async function migrate() {
  // information_schema (not `SHOW COLUMNS`, which labels the field `Field`).
  const cols = await sequelize.query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'`,
    { type: QueryTypes.SELECT },
  )
  const existing = new Set(cols.map((c) => c.COLUMN_NAME))

  const additions: Array<{ name: string; def: string }> = [
    { name: 'google_sub', def: 'ADD COLUMN `google_sub` VARCHAR(255) NULL' },
    {
      name: 'phone_verified',
      def: 'ADD COLUMN `phone_verified` BOOLEAN NOT NULL DEFAULT 1',
    },
  ]

  const added: string[] = []

  for (const { name, def } of additions) {
    if (existing.has(name)) {
      console.log(`  ${name} already exists, skipping`)
      continue
    }
    await sequelize.query(`ALTER TABLE customers ${def}`)
    added.push(name)
    console.log(`  Added ${name}`)
  }

  // Accounts that predate this column registered a real phone number, so they
  // count as verified. This must only happen the first time the column appears:
  // re-running it later would "verify" Google accounts that are still waiting for
  // a number, defeating the prompt. The column's DEFAULT 1 already covers the
  // existing rows, so the UPDATE is only a safety net for a partial earlier run.
  if (added.includes('phone_verified')) {
    await sequelize.query(
      `UPDATE customers SET phone_verified = 1 WHERE phone_verified IS NULL OR phone_verified = 0`,
    )
    console.log('  Backfilled phone_verified = 1 for pre-existing accounts')
  } else {
    console.log('  phone_verified already present, leaving its values untouched')
  }

  // The unique index may already exist under a different name (Sequelize's
  // sync creates `customers_google_sub`), so match on the column + uniqueness.
  const indexes = await sequelize.query<{ INDEX_NAME: string; COLUMN_NAME: string; NON_UNIQUE: number }>(
    `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'`,
    { type: QueryTypes.SELECT },
  )
  const hasUniqueGoogleIndex = indexes.some(
    (i) => i.COLUMN_NAME === 'google_sub' && Number(i.NON_UNIQUE) === 0,
  )

  if (!hasUniqueGoogleIndex) {
    await sequelize.query(
      `ALTER TABLE customers ADD UNIQUE KEY customers_google_sub_unique (google_sub)`,
    )
    console.log('  Added unique index on google_sub')
  } else {
    console.log('  Unique index on google_sub already exists, skipping')
  }

  console.log('Migration complete.')
  await sequelize.close()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
