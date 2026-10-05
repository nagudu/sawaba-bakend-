import '../models'
import { sequelize } from '../config/database'

/**
 * Add-only schema-drift healer.
 *
 * `sequelize.sync({ force: false })` only creates MISSING TABLES — it never
 * adds columns to tables that already exist. When a model gains fields after
 * its table was first created (e.g. barbers.portal_enabled / password_hash),
 * every SELECT of the full row dies with ER_BAD_FIELD_ERROR (errno 1054).
 *
 * This script walks every registered model, describes its live table, and
 * issues ADD COLUMN only for attributes that are genuinely absent. It never
 * drops, modifies or rewrites anything — existing data is untouched — and it
 * is idempotent, so it is safe to run on every boot.
 */
export async function ensureModelColumns(): Promise<string[]> {
  const qi = sequelize.getQueryInterface()
  const added: string[] = []

  for (const model of Object.values(sequelize.models)) {
    const tableName = model.getTableName()
    if (typeof tableName !== 'string') continue

    let described: Record<string, unknown>
    try {
      described = await qi.describeTable(tableName)
    } catch {
      // Table not created yet — sequelize.sync() will create it whole.
      continue
    }

    for (const [attrName, attr] of Object.entries(model.rawAttributes)) {
      const declared = attr.field
      const snake = attrName.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
      const candidates = [declared, attrName, snake].filter(Boolean) as string[]
      // Present under any of the naming conventions → no drift.
      if (candidates.some((c) => c in described)) continue
      const columnName = declared ?? snake

      try {
        await qi.addColumn(tableName, columnName, {
          type: attr.type,
          allowNull: attr.allowNull ?? true,
          defaultValue: attr.defaultValue,
        })
        added.push(`${tableName}.${columnName}`)
        console.log(`[schema-drift] added ${tableName}.${columnName}`)
      } catch (error) {
        // Never let healing abort startup: report and continue.
        console.error(`[schema-drift] failed ${tableName}.${columnName}:`, error)
      }
    }
  }

  return added
}

// Allow running standalone: npx tsx src/scripts/ensureColumns.ts
if (require.main === module) {
  ;(async () => {
    const added = await ensureModelColumns()
    console.log(
      added.length === 0
        ? '[schema-drift] no drift detected — all model columns present'
        : `[schema-drift] ${added.length} column(s) added`,
    )
    await sequelize.close()
  })().catch((error) => {
    console.error('[schema-drift] fatal:', error)
    process.exit(1)
  })
}
