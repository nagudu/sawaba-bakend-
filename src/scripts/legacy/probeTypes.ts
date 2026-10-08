/**
 * Determines exactly how to reproduce Sequelize's wire format from Prisma values:
 *  - does Decimal.toString() keep the DECIMAL(x,2) scale ("500.00") or not?
 *  - do @db.Date columns come back as UTC-midnight Date objects?
 * Run: npx tsx src/scripts/probeTypes.ts
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'
import { Service, Payment, Appointment } from '../models'
import { sequelize } from '../config/database'

const url = new URL(env.databaseUrl)
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionLimit: 2,
  }),
  log: ['error'],
})

async function main() {
  const svc = await prisma.service.findFirst({ orderBy: { id: 'asc' } })
  const raw = svc?.price
  console.log('--- Prisma Decimal ---')
  console.log('  typeof            :', typeof raw)
  console.log('  constructor      :', (raw as object)?.constructor?.name)
  console.log('  .toString()      :', String(raw))
  console.log('  .toFixed(2)      :', (raw as { toFixed(n: number): string }).toFixed(2))
  console.log('  JSON.stringify   :', JSON.stringify({ price: raw }))
  const seqPrice = (await Service.findOne({ order: [['id', 'ASC']] }))?.price
  console.log('  sequelize typeof  :', typeof seqPrice, '| value:', JSON.stringify(seqPrice))

  console.log('\n--- @db.Date ---')
  const appt = await prisma.appointment.findFirst({ orderBy: { id: 'asc' } })
  if (appt) {
    const d = appt.appointmentDate
    console.log('  instanceof Date   :', d instanceof Date)
    console.log('  toISOString()     :', d.toISOString())
    console.log('  YYYY-MM-DD (UTC)  :', d.toISOString().slice(0, 10))
  } else {
    console.log('  (no appointments to sample)')
  }
  const seqAppt = await Appointment.findOne({ order: [['id', 'ASC']] })
  console.log('  sequelize typeof  :', typeof seqAppt?.appointmentDate, '| value:', JSON.stringify(seqAppt?.appointmentDate))

  const pay = await prisma.payment.findFirst({ orderBy: { id: 'asc' } })
  console.log('  paymentDate (prisma):', pay?.paymentDate ? pay.paymentDate.toISOString() : 'null')
  console.log('  paymentDate (seq)   :', JSON.stringify((await Payment.findOne())?.paymentDate))

  await prisma.$disconnect()
  await sequelize.close()
}

void main()
