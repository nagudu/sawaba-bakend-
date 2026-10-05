/**
 * Diagnostics for the missing Appointment row: what still references it, and
 * whether the FK would have allowed the delete. Read-only.
 * Run: npx tsx src/scripts/orphanAudit.ts
 */
import { sequelize } from '../config/database'
import { env } from '../config/env'

type Row = Record<string, unknown>

async function main() {
  await sequelize.authenticate()

  const counts = (await sequelize.query(
    `SELECT TABLE_NAME AS t, TABLE_ROWS AS rows_est FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
  ))[0] as Row[]
  console.log('=== exact row counts ===')
  for (const r of counts) {
    const res = (await sequelize.query(`SELECT COUNT(*) AS c FROM \`${String(r.t)}\``))[0] as Row[]
    console.log(`  ${String(r.t).padEnd(28)} ${String((res[0] as Row).c)}`)
  }

  console.log('\n=== rows referencing a missing appointment ===')
  for (const t of ['payments', 'barber_earnings', 'checkout_sessions', 'barber_assignment_history']) {
    const rows = (await sequelize.query(`SELECT * FROM \`${t}\``))[0] as Row[]
    for (const row of rows) {
      const apptId = row.appointment_id ?? row.converted_appointment_id
      if (apptId === undefined || apptId === null) continue
      const exists = (await sequelize.query(`SELECT id FROM appointments WHERE id = ?`, { replacements: [apptId] }))[0] as Row[]
      if (!exists.length) console.log(`  ${t}: ${JSON.stringify(row)}`)
    }
  }

  console.log('\n=== FK definition on barber_earnings.appointment_id ===')
  const fks = (await sequelize.query(
    `SELECT rc.CONSTRAINT_NAME, rc.REFERENCED_TABLE_NAME, rc.DELETE_RULE, rc.UPDATE_RULE
       FROM information_schema.REFERENTIAL_CONSTRAINTS rc
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
        AND rc.REFERENCED_TABLE_NAME = 'appointments'`,
  ))[0] as Row[]
  for (const f of fks) console.log(`  ${JSON.stringify(f)}`)

  await sequelize.close()
  void env
}

void main()
