/**
 * One-time repair for the legacy phone-only customer merge.
 *
 * Before the identity fix, findOrCreateCustomer() linked EVERY booking made
 * with a phone number to ONE customer record — so an account could host other
 * people's bookings (name/email snapshots differ from the record's identity).
 *
 * This script re-links each appointment (and its payment) to the customer
 * record that matches the booking's own identity snapshot, using exactly the
 * same rule as booking-time matching:
 *   same normalized full name AND compatible email (at least one empty, or equal)
 * It never deletes anything: missing target records are created as guest
 * records, account records are never modified except to release bookings that
 * do not belong to them.
 *
 * Default is a DRY RUN (prints the plan). Pass --apply to perform it.
 * Run from backend/: npx tsx src/scripts/splitSharedIdentityBookings.ts [--apply]
 */
import { prisma } from '../config/database'

const APPLY = process.argv.includes('--apply')

function normName(value: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}
function normEmail(value: string | null): string | null {
  return (value ?? '').trim().toLowerCase() || null
}

interface AppointmentRow {
  id: number
  referenceCode: string | null
  customerName: string
  customerEmail: string | null
  customerId: number | null
  customerPhone: string
}

function identityMatches(
  record: { fullName: string; email: string | null },
  appt: AppointmentRow,
): boolean {
  if (normName(record.fullName) !== normName(appt.customerName)) return false
  const recordEmail = normEmail(record.email)
  const apptEmail = normEmail(appt.customerEmail)
  if (recordEmail && apptEmail && recordEmail !== apptEmail) return false
  return true
}

async function main() {
  const customers = await prisma.customer.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      passwordHash: true,
      googleSub: true,
      lastLoginAt: true,
    },
  })

  const plan: Array<{ appointmentId: number; ref: string | null; from: number; to: number; reason: string }> = []
  const createRecords = new Map<string, { fullName: string; phone: string; email: string | null }>()

  for (const record of customers) {
    const appointments = await prisma.appointment.findMany({
      where: { customerId: record.id },
      orderBy: { id: 'asc' },
    })
    for (const appt of appointments) {
      if (identityMatches(record, appt)) continue

      // Find the right home: any EXISTING record (any phone) whose identity
      // matches the booking snapshot. Account records qualify only if the
      // snapshot truly matches them — that keeps same-person history together.
      const target =
        customers.find(
          (c) => c.id !== record.id && identityMatches(c, appt as unknown as AppointmentRow),
        ) ?? null

      let targetId: number
      let reason: string
      if (target) {
        targetId = target.id
        reason = `matches existing record #${target.id} (${target.fullName})`
      } else {
        const key = `${normName(appt.customerName)}|${normEmail(appt.customerEmail) ?? ''}|${appt.customerPhone}`
        let created = createRecords.get(key)
        if (!created) {
          created = {
            fullName: appt.customerName,
            phone: appt.customerPhone,
            email: appt.customerEmail,
          }
          createRecords.set(key, created)
        }
        targetId = -1 // resolved during apply
        reason = `new guest record for "${appt.customerName}" <${appt.customerEmail ?? 'no email'}>`
      }

      plan.push({
        appointmentId: appt.id,
        ref: appt.referenceCode,
        from: record.id,
        to: targetId,
        reason,
      })
    }
  }

  if (plan.length === 0) {
    console.log('Nothing to repair — every booking already matches its customer record.')
    return
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN — re-link plan'} (${plan.length} bookings):`)
  for (const row of plan) {
    console.log(
      `  ${row.ref ?? `#${row.appointmentId}`}: customer #${row.from} -> ${
        row.to === -1 ? 'new guest record' : `#${row.to}`
      } (${row.reason})`,
    )
  }
  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to perform the repair.')
    return
  }

  // Materialise new guest records once, then resolve targets.
  const newIds = new Map<string, number>()
  for (const [key, data] of createRecords) {
    const created = await prisma.customer.create({ data })
    newIds.set(key, created.id)
    console.log(`  created guest record #${created.id} "${created.fullName}"`)
  }

  let moved = 0
  for (const row of plan) {
    let targetId = row.to
    if (targetId === -1) {
      const appt = await prisma.appointment.findUnique({ where: { id: row.appointmentId } })
      if (!appt) continue
      const key = `${normName(appt.customerName)}|${normEmail(appt.customerEmail) ?? ''}|${appt.customerPhone}`
      targetId = newIds.get(key)!
      if (!targetId) continue
    }
    await prisma.$transaction([
      prisma.appointment.update({
        where: { id: row.appointmentId },
        data: { customerId: targetId },
      }),
      prisma.payment.updateMany({
        where: { appointmentId: row.appointmentId },
        data: { customerId: targetId },
      }),
    ])
    moved += 1
  }
  console.log(`\nRe-linked ${moved} bookings.`)
}

main()
  .catch((error) => {
    console.error('repair failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
