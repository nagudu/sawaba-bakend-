/**
 * Generates src/config/prismaFieldTypes.ts from prisma/schema.prisma.
 *
 * Prisma and Sequelize disagree on two wire formats, and this app's public API is
 * consumed by a React frontend that already depends on Sequelize's shapes:
 *
 *  - DECIMAL: Sequelize/mysql2 return the raw column text ("500.00"); Prisma's
 *    Decimal JSON-serialises to "500" (it drops the column's scale). Money must
 *    keep the DB scale, so we need to know each column's scale.
 *  - @db.Date: Sequelize returns "2026-09-25"; Prisma returns a UTC-midnight
 *    Date, which JSON-serialises to "2026-09-25T00:00:00.000Z".
 *
 * Rather than hand-maintain those two lists, derive them from the schema.
 *
 *   npx tsx src/scripts/genPrismaFieldTypes.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SCHEMA = path.resolve(__dirname, '../../prisma/schema.prisma')
const OUT = path.resolve(__dirname, '../config/prismaFieldTypes.ts')

const schema = readFileSync(SCHEMA, 'utf8')

// Scale comes from @db.Decimal(p, s); bare `Decimal` defaults to MySQL's (10,0).
const decimalScale = new Map<string, number>()
const dateOnly = new Set<string>()

for (const line of schema.split(/\r?\n/)) {
  const field = line.match(/^\s{2}([A-Za-z][A-Za-z0-9_]*)\s+/)
  if (!field) continue
  const name = field[1]
  const dec = line.match(/@db\.Decimal\(\s*\d+\s*,\s*(\d+)\s*\)/)
  if (dec) {
    decimalScale.set(name, Number(dec[1]))
    continue
  }
  // bare `Decimal` (no @db.Decimal) is integer-scaled
  if (/^\s{2}[A-Za-z][A-Za-z0-9_]*\s+Decimal\b/.test(line) && !line.includes('@db.Decimal')) {
    decimalScale.set(name, 0)
    continue
  }
  // `@db.Date` but NOT `@db.DateTime(...)`
  if (/@db\.Date\b/.test(line)) dateOnly.add(name)
}

const entries = [...decimalScale.entries()].sort(([a], [b]) => a.localeCompare(b))
const body = `// GENERATED FILE — do not edit. Run: npm run db:field-types
// Source: prisma/schema.prisma

/** Field name -> DECIMAL scale, so money serialises exactly as it does today. */
export const DECIMAL_SCALE: Readonly<Record<string, number>> = {
${entries.map(([k, v]) => `  ${k}: ${v},`).join('\n')}
}

/** Field names backed by MySQL DATE, which must serialise as "YYYY-MM-DD". */
export const DATE_ONLY_FIELDS: ReadonlySet<string> = new Set([
${[...dateOnly].sort().map((k) => `  '${k}',`).join('\n')}
])
`

writeFileSync(OUT, body, 'utf8')
console.log(`decimal fields: ${entries.length}`)
console.log(`date-only fields: ${dateOnly.size}`)
console.log(`wrote ${path.relative(process.cwd(), OUT)}`)
