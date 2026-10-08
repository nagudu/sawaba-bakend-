/**
 * Rebuilds the Appointment row (id 1) that was deleted while FK enforcement was
 * bypassed, so the CASCADE-linked barber_earnings row has its parent again.
 *
 * Source of truth: checkout_sessions rows whose converted_appointment_id points at
 * the missing appointment, cross-checked against barber_earnings amounts.
 * Run: npx tsx src/scripts/reconstructAppointment.ts   (add --confirm to write)
 */
import { sequelize } from '../config/database'
import { Appointment, BarberEarning, CheckoutSession, Service } from '../models'

const TARGET_ID = 1
const CONFIRMED = process.argv.includes('--confirm')

function fmtDate(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

async function main() {
  const existing = await Appointment.findByPk(TARGET_ID)
  if (existing) {
    console.log(`appointment ${TARGET_ID} already exists — nothing to do`)
    await sequelize.close()
    return
  }

  const sessions = (await CheckoutSession.findAll({
    where: { convertedAppointmentId: TARGET_ID } as never,
    order: [['id', 'ASC']] as never,
  })) as unknown as Array<Record<string, unknown>>

  if (!sessions.length) {
    console.log('no checkout_sessions reference that appointment id — cannot rebuild safely')
    await sequelize.close()
    process.exit(1)
  }

  const earnings = (await BarberEarning.findAll({
    where: { appointmentId: TARGET_ID } as never,
  })) as unknown as Array<Record<string, unknown>>

  // Prefer the session whose total matches the recorded service_amount, so the
  // appointment and its earning row stay financially consistent.
  let chosen = sessions[0]
  if (earnings.length) {
    const svcAmount = Number(earnings[0].serviceAmount)
    const match = sessions.find((s) => Number(s.totalAmount) === svcAmount)
    if (match) chosen = match
  }

  const serviceId = Number(chosen.serviceId)
  const service = await Service.findByPk(serviceId)
  if (!service) {
    console.log(`service ${serviceId} referenced by checkout session ${String(chosen.id)} no longer exists — refusing to invent a substitute`)
    await sequelize.close()
    process.exit(1)
  }

  const customer = await sequelize.query('SELECT id, email FROM customers WHERE email = ?', {
    replacements: [chosen.customerEmail as string],
  })
  const customerId = (customer[0] as Array<Record<string, unknown>>)[0]?.id ?? null

  const appointmentDate = fmtDate(chosen.appointmentDate)
  const dayCount = await Appointment.count({ where: { appointmentDate } as never })
  const referenceCode = `APT-${appointmentDate.replace(/-/g, '')}-${String(dayCount + 1).padStart(3, '0')}`

  console.log('=== rebuild plan ===')
  console.log(`  source session      : #${String(chosen.id)} (of ${sessions.length} candidates)`)
  console.log(`  customer            : ${String(chosen.customerName)} <${String(chosen.customerEmail)}> customerId=${customerId}`)
  console.log(`  service / barber    : #${serviceId} ${service.name} / #${String(chosen.barberId)}`)
  console.log(`  when                : ${appointmentDate} ${String(chosen.appointmentTime)}`)
  console.log(`  totalAmount         : ${String(chosen.totalAmount)} (matches earning service_amount ${String(earnings[0]?.serviceAmount ?? 'n/a')})`)
  console.log(`  status              : READY_FOR_SERVICE (earning is ${String(earnings[0]?.status ?? 'n/a')})`)
  console.log(`  referenceCode       : ${referenceCode}`)
  console.log(`  explicit id         : ${TARGET_ID} (so checkout_sessions.converted_appointment_id stays valid)`)

  if (!CONFIRMED) {
    console.log('\nDRY RUN — re-run with --confirm to write.')
    await sequelize.close()
    return
  }

  await sequelize.query(
    `INSERT INTO appointments
       (id, customer_name, customer_phone, customer_email, customer_location, customer_id,
        service_id, barber_id, assigned_barber_id, appointment_date, appointment_time,
        total_amount, status, reference_code, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    {
      replacements: [
        TARGET_ID,
        chosen.customerName,
        chosen.customerPhone,
        chosen.customerEmail,
        chosen.customerLocation ?? null,
        customerId,
        serviceId,
        chosen.barberId,
        chosen.barberId,
        appointmentDate,
        chosen.appointmentTime,
        chosen.totalAmount,
        'READY_FOR_SERVICE',
        referenceCode,
        chosen.notes ?? null,
      ],
    },
  )

  const after = await Appointment.findByPk(TARGET_ID)
  console.log(`\ninserted appointment ${TARGET_ID}: ${JSON.stringify(after?.toJSON())}`)
  await sequelize.close()
}

void main()
