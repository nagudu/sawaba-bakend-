/**
 * Phase 1 gate: the introspected Prisma schema must agree with the live database
 * and with Sequelize on every table, before any application code is migrated.
 *
 *   npx tsx src/scripts/prismaParity.ts
 *
 * Per table: row counts match, and the 3 lowest-id rows are field-for-field
 * identical through both ORMs.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'
import { serializePrisma } from '../utils/prismaSerialize'
import { sequelize } from '../config/database'
import {
  Admin,
  Appointment,
  Barber,
  BarberAssignmentHistory,
  BarberAvailability,
  BarberEarning,
  BarberNotification,
  BarberService,
  CheckoutSession,
  CommissionRateHistory,
  ContactMessage,
  ContactReply,
  Customer,
  CustomerOtp,
  Gallery,
  Payment,
  PaymentSetting,
  Review,
  Service,
} from '../models'

const url = new URL(env.databaseUrl)
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: url.port ? Number(url.port) : 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  charset: 'utf8mb4',
  connectionLimit: 2,
})
const prisma = new PrismaClient({ adapter, log: ['error'] })

type Delegate = { count(): Promise<number>; findMany(args?: unknown): Promise<unknown[]> }
/** Structural view of a Sequelize model — avoids fighting Sequelize's generics. */
type Countable = {
  name: string
  count(): Promise<number>
  findAll(options?: unknown): Promise<unknown[]>
}

const TABLES: { prisma: string; model: unknown }[] = [
  { prisma: 'admin', model: Admin },
  { prisma: 'appointment', model: Appointment },
  { prisma: 'barberAssignmentHistory', model: BarberAssignmentHistory },
  { prisma: 'barberAvailability', model: BarberAvailability },
  { prisma: 'barberEarning', model: BarberEarning },
  { prisma: 'barberNotification', model: BarberNotification },
  { prisma: 'barberService', model: BarberService },
  { prisma: 'barber', model: Barber },
  { prisma: 'checkoutSession', model: CheckoutSession },
  { prisma: 'commissionRateHistory', model: CommissionRateHistory },
  { prisma: 'contactMessage', model: ContactMessage },
  { prisma: 'contactReply', model: ContactReply },
  { prisma: 'customerOtp', model: CustomerOtp },
  { prisma: 'customer', model: Customer },
  { prisma: 'gallery', model: Gallery },
  { prisma: 'paymentSetting', model: PaymentSetting },
  { prisma: 'payment', model: Payment },
  { prisma: 'review', model: Review },
  { prisma: 'service', model: Service },
]

/**
 * Order-insensitive JSON. Object key ORDER differs between Prisma (column order)
 * and Sequelize (model attribute order), and key order is irrelevant to JSON
 * consumers, so compare with keys sorted. Values are left untouched — Decimal and
 * @db.Date normalisation is serializePrisma's job, and if that were broken we
 * want the mismatch to show up.
 */
function canon(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'bigint') return Number(v)
  if (Array.isArray(v)) return v.map(canon)
  if (typeof v === 'object') {
    if (Buffer.isBuffer(v)) return v
    const o = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) out[k] = canon(o[k])
    return out
  }
  return v
}

/** Report exactly which keys differ between the two shapes, per row. */
function keyDiffs(p: unknown, s: unknown, path = ''): string[] {
  if (p === s) return []
  const bothObjects =
    p && s && typeof p === 'object' && typeof s === 'object' && !Array.isArray(p) && !Array.isArray(s)
  if (!bothObjects) return [`${path || '<value>'}: prisma=${JSON.stringify(p)} sequelize=${JSON.stringify(s)}`]
  const keys = new Set([...Object.keys(p as object), ...Object.keys(s as object)])
  const out: string[] = []
  for (const k of keys) {
    const pv = (p as Record<string, unknown>)[k]
    const sv = (s as Record<string, unknown>)[k]
    if (JSON.stringify(pv) === JSON.stringify(sv)) continue
    out.push(...keyDiffs(pv, sv, path ? `${path}.${k}` : k))
  }
  return out
}

async function main() {
  await sequelize.authenticate()
  let failed = 0
  const out: string[] = []

  for (const { prisma: pm, model: rawModel } of TABLES) {
    const model = rawModel as Countable
    const label = model.name
    try {
      const delegate = (prisma as unknown as Record<string, Delegate>)[pm]
      if (!delegate) throw new Error(`no prisma delegate "${pm}"`)

      const pc = await delegate.count()
      const sc = await model.count()

      const pRows = await delegate.findMany({ orderBy: { id: 'asc' }, take: 3 })
      const sRows = (await model.findAll({ order: [['id', 'ASC']], limit: 3 })).map((r) =>
        (r as { toJSON(): Record<string, unknown> }).toJSON(),
      )
      // The real gate: after normalising Prisma's value types, the API must emit
      // byte-identical JSON to the Sequelize-backed implementation.
      const pJson = pRows.map((r) => JSON.stringify(canon(serializePrisma(r))))
      const sJson = sRows.map((r) => JSON.stringify(canon(r)))
      const rowsOk = pJson.length === sJson.length && pJson.every((v, i) => v === sJson[i])

      if (pc !== sc || !rowsOk) {
        failed++
        out.push(`  FAIL ${label.padEnd(26)} prisma=${pc} sequelize=${sc}`)
        for (let i = 0; i < Math.max(pRows.length, sRows.length); i++) {
          const diffs = keyDiffs(canon((pRows as unknown[])[i]), canon(sRows[i]))
          for (const d of diffs.slice(0, 4)) out.push(`       row#${i} ${d}`)
        }
      } else {
        out.push(`  ok   ${label.padEnd(26)} rows=${pc}`)
      }
    } catch (e) {
      failed++
      out.push(`  ERR  ${label.padEnd(26)} ${(e as Error).message.split('\n')[0]}`)
    }
  }

  console.log('\n=== prisma vs sequelize parity ===')
  for (const l of out) console.log(l)
  console.log(`\n${TABLES.length - failed}/${TABLES.length} tables agree`)
  if (failed) console.log('PARITY FAILED — do not migrate application code yet')

  await prisma.$disconnect()
  await sequelize.close()
  process.exit(failed ? 1 : 0)
}

void main()
