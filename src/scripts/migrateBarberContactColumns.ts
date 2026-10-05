import { sequelize } from '../config/database'
import { QueryTypes } from 'sequelize'

async function migrate() {
  const cols = await sequelize.query<{ Column_name: string }>(
    `SHOW COLUMNS FROM barbers`,
    { type: QueryTypes.SELECT },
  )
  const existing = new Set(cols.map((c) => c.Column_name))

  const additions: Array<{ name: string; def: string }> = [
    { name: 'phone', def: 'ADD COLUMN `phone` VARCHAR(32) NULL' },
    { name: 'email', def: 'ADD COLUMN `email` VARCHAR(255) NULL' },
  ]

  for (const { name, def } of additions) {
    if (!existing.has(name)) {
      await sequelize.query(`ALTER TABLE barbers ${def}`)
      console.log(`  Added ${name}`)
    } else {
      console.log(`  ${name} already exists, skipping`)
    }
  }

  console.log('Migration complete.')
  await sequelize.close()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})