import '../models'
import { sequelize } from '../config/database'
import {
  Admin, Appointment, Barber, BarberAssignmentHistory, BarberAvailability, BarberEarning, BarberNotification,
  BarberService, CheckoutSession, ContactMessage, ContactReply, Customer,
  CustomerOtp, Gallery, Payment, Review, Service,
} from '../models'
import { Op } from 'sequelize'

const like = (p: string) => ({ [Op.like]: `%${p}%` })

// Any row created by a QA harness: test e-mail domains, QA/Journey/Probe/Sec names, generated phones,
// plus the TEST-*/LOC-TEST/Checkout Tester rows left by earlier sessions.
const QA_EMAIL = [like('@test.local'), like('qa-cust-'), like('probe'), like('journey-'), like('resp-'), like('secprobe'), like('cascade'), like('smoke'), like('test-'), like('checkout-tester')]
const QA_NAME = [like('QA %'), like('Journey %'), like('Journey Customer'), like('Probe %'), like('SecProbe'), like('Cascade'), like('Resp %'), like('TEST-%'), like('LOC-TEST %'), like('Checkout Tester')]
const GENUINE_BARBER = 'Gaddafi Salisu'
const GENUINE_CUSTOMER = 'Halifa Shuaibu'

let removed = 0
const tally: Record<string, number> = {}
const bump = (k: string, n = 1) => { tally[k] = (tally[k] ?? 0) + n; removed += n }

async function main(): Promise<void> {
  await sequelize.authenticate()
  const dryRun = process.argv.includes('--dry-run')

  // ---------- report what we are about to touch ----------
  const qaBarbers = await Barber.findAll({ where: { [Op.or]: [{ email: { [Op.or]: QA_EMAIL } }, { name: { [Op.or]: QA_NAME } }] }, attributes: ['id', 'name', 'email', 'isActive'] })
  const qaCustomers = await Customer.findAll({ where: { [Op.or]: [{ email: { [Op.or]: QA_EMAIL } }, { fullName: { [Op.or]: QA_NAME } }] }, attributes: ['id', 'fullName', 'email', 'phone'] })
  console.log(`\nQA barbers: ${qaBarbers.length}`)
  qaBarbers.forEach((b) => console.log(`   #${b.id} ${b.name} <${b.email ?? 'no-email'}> active=${b.isActive}`))
  console.log(`QA customers: ${qaCustomers.length}`)
  qaCustomers.forEach((c) => console.log(`   #${c.id} ${c.fullName} <${c.email ?? 'no-email'}> ${c.phone}`))

  const qaBIds = qaBarbers.map((b) => b.id)
  const qaCIds = qaCustomers.map((c) => c.id)

  // appointments owned by, or named after, a QA customer/barber
  const qaAppts = await Appointment.findAll({
    where: { [Op.or]: [
      ...(qaCIds.length ? [{ customerId: { [Op.in]: qaCIds } }] : []),
      ...(qaBIds.length ? [{ barberId: { [Op.in]: qaBIds } }] : []),
      { customerName: { [Op.or]: QA_NAME } },
      { customerPhone: { [Op.like]: '080%' }, customerEmail: { [Op.or]: QA_EMAIL } },
    ] },
    attributes: ['id', 'referenceCode', 'customerName', 'status'],
  })
  const qaApptIds = qaAppts.map((a) => a.id)
  console.log(`QA appointments: ${qaAppts.length}`)

  const counts = {
    payments: qaApptIds.length ? await Payment.count({ where: { appointmentId: { [Op.in]: qaApptIds } } }) : 0,
    earnings: qaApptIds.length ? await BarberEarning.count({ where: { appointmentId: { [Op.in]: qaApptIds } } }) : 0,
    assignHistory: qaApptIds.length ? await BarberAssignmentHistory.count({ where: { appointmentId: { [Op.in]: qaApptIds } } }) : 0,
    sessions: qaApptIds.length ? await CheckoutSession.count({ where: { convertedAppointmentId: { [Op.in]: qaApptIds } } }) : 0,
    orphanSessions: await CheckoutSession.count({ where: { status: { [Op.in]: ['OPEN', 'AWAITING_PAYMENT', 'EXPIRED'] } } }),
    otp: await CustomerOtp.count({ where: { [Op.or]: [{ phone: { [Op.like]: '080%' } }, { expiresAt: { [Op.lt]: new Date() } }] } }),
    notifs: qaBIds.length ? await BarberNotification.count({ where: { barberId: { [Op.in]: qaBIds } } }) : 0,
    reviews: await Review.count({ where: { [Op.or]: [{ customerName: { [Op.or]: QA_NAME }, customerEmail: { [Op.or]: QA_EMAIL } }] } }),
    contacts: await ContactMessage.count({ where: { [Op.or]: [{ name: { [Op.or]: QA_NAME } }, { email: { [Op.or]: QA_EMAIL } }] } }),
    replies: await ContactReply.count({ where: { [Op.or]: [{ subject: { [Op.like]: 'QA%' } }, { message: { [Op.like]: 'QA%' } }] } }),
    gallery: await Gallery.count({ where: { [Op.or]: [{ title: { [Op.or]: QA_NAME } }, { image: { [Op.like]: '%qa-%' } }] } }),
  }
  console.log('dependent rows:', JSON.stringify(counts))

  // ---------- prove the genuine business data is not in the delete set ----------
  const keptBarbers = await Barber.findAll({ where: { id: { [Op.notIn]: qaBIds.length ? qaBIds : [0] } }, attributes: ['id', 'name', 'email'] })
  const keptCustomers = await Customer.findAll({ where: { id: { [Op.notIn]: qaCIds.length ? qaCIds : [0] } }, attributes: ['id', 'fullName', 'email'] })
  const keptAppts = await Appointment.findAll({ where: { id: { [Op.notIn]: qaApptIds.length ? qaApptIds : [0] } }, attributes: ['id', 'referenceCode', 'customerName', 'status'] })
  console.log(`\nPRESERVED barbers:   ${keptBarbers.map((b) => `#${b.id} ${b.name}`).join(' | ') || 'none'}`)
  console.log(`PRESERVED customers: ${keptCustomers.map((c) => `#${c.id} ${c.fullName}`).join(' | ') || 'none'}`)
  console.log(`PRESERVED appointments: ${keptAppts.map((a) => `#${a.id} ${a.referenceCode} (${a.customerName})`).join(' | ') || 'none'}`)
  if (process.argv.includes('--confirm')) {
    const realCustomer = keptCustomers.find((c) => c.fullName === GENUINE_CUSTOMER)
    const realBarber = keptBarbers.find((b) => b.name === GENUINE_BARBER)
    const realAppt = keptAppts.find((a) => a.customerName === GENUINE_CUSTOMER)
    if (!realCustomer || !realBarber || !realAppt) {
      console.log(`\n!! genuine data missing from the preserved set - ABORT (barber=${Boolean(realBarber)} customer=${Boolean(realCustomer)} appointment=${Boolean(realAppt)})`)
      await sequelize.close(); process.exit(2)
    }
    console.log(`\ngenuine records preserved: barber #${realBarber.id}, customer #${realCustomer.id}, appointment #${realAppt.id} (${realAppt.referenceCode})`)
  }

  if (dryRun) { console.log('\n(dry run - nothing deleted)'); await sequelize.close(); return }

  // ---------- delete leaves first ----------
  if (qaApptIds.length) {
    bump('payments', await Payment.destroy({ where: { appointmentId: { [Op.in]: qaApptIds } } }))
    bump('barberEarnings', await BarberEarning.destroy({ where: { appointmentId: { [Op.in]: qaApptIds } } }))
    bump('assignmentHistory', await BarberAssignmentHistory.destroy({ where: { appointmentId: { [Op.in]: qaApptIds } } }))
    bump('checkoutSessions', await CheckoutSession.destroy({ where: { convertedAppointmentId: { [Op.in]: qaApptIds } } }))
    bump('appointments', await Appointment.destroy({ where: { id: { [Op.in]: qaApptIds } } }))
  }
  bump('abandonedSessions', await CheckoutSession.destroy({ where: { status: { [Op.in]: ['OPEN', 'AWAITING_PAYMENT', 'EXPIRED'] } } }))
  bump('customerOtp', await CustomerOtp.destroy({ where: { [Op.or]: [{ phone: { [Op.like]: '080%' } }, { expiresAt: { [Op.lt]: new Date() } }] } }))
  if (qaBIds.length) {
    bump('barberNotifications', await BarberNotification.destroy({ where: { barberId: { [Op.in]: qaBIds } } }))
    bump('barberServices', await BarberService.destroy({ where: { barberId: { [Op.in]: qaBIds } } }))
    bump('barberAvailability', await BarberAvailability.destroy({ where: { barberId: { [Op.in]: qaBIds } } }))
    bump('barberAssignmentHistory', await BarberAssignmentHistory.destroy({ where: { [Op.or]: [{ previousBarberId: { [Op.in]: qaBIds } }, { newBarberId: { [Op.in]: qaBIds } }] } }))
    bump('barberEarningsByBarber', await BarberEarning.destroy({ where: { barberId: { [Op.in]: qaBIds } } }))
  }
  bump('reviews', await Review.destroy({ where: { [Op.or]: [{ customerName: { [Op.or]: QA_NAME }, customerEmail: { [Op.or]: QA_EMAIL } }] } }))
  bump('contactReplies', await ContactReply.destroy({ where: { [Op.or]: [{ subject: { [Op.like]: 'QA%' }, message: { [Op.like]: 'QA%' } }] } }))
  bump('contactMessages', await ContactMessage.destroy({ where: { [Op.or]: [{ name: { [Op.or]: QA_NAME } }, { email: { [Op.or]: QA_EMAIL } }] } }))
  bump('gallery', await Gallery.destroy({ where: { [Op.or]: [{ title: { [Op.or]: QA_NAME } }, { image: { [Op.like]: '%qa-%' } }] } }))
  bump('customers', await Customer.destroy({ where: { id: { [Op.in]: qaCIds } } }))
  bump('barbers', await Barber.destroy({ where: { id: { [Op.in]: qaBIds } } }))

  // ---------- legacy orphans left by pre-fix barber deletes ----------
  const orphanServices = await BarberService.findAll({ attributes: ['barberId'] })
  const liveBarberIds = new Set((await Barber.findAll({ attributes: ['id'] })).map((b) => b.id))
  const deadServiceBarberIds = [...new Set(orphanServices.map((s) => s.barberId))].filter((id) => !liveBarberIds.has(id))
  const orphanAvail = await BarberAvailability.findAll({ attributes: ['barberId'] })
  const deadAvailBarberIds = [...new Set(orphanAvail.map((a) => a.barberId))].filter((id) => !liveBarberIds.has(id))
  if (deadServiceBarberIds.length) bump('orphanBarberServices', await BarberService.destroy({ where: { barberId: { [Op.in]: deadServiceBarberIds } } }))
  if (deadAvailBarberIds.length) bump('orphanBarberAvailability', await BarberAvailability.destroy({ where: { barberId: { [Op.in]: deadAvailBarberIds } } }))

  // appointments/payments whose barber no longer exists
  const liveApptBarberIds = [...new Set((await Appointment.findAll({ attributes: ['barberId'] })).map((a) => a.barberId))]
  const deadApptBarberIds = liveApptBarberIds.filter((id) => !liveBarberIds.has(id))
  if (deadApptBarberIds.length) console.log(`\n! ${deadApptBarberIds.length} barber id(s) still referenced by appointments: ${deadApptBarberIds.join(',')} (left in place - needs a decision)`)

  // notifications that point at appointments which no longer exist
  const liveApptIds = new Set((await Appointment.findAll({ attributes: ['id'] })).map((a) => a.id))
  const notifRows = await BarberNotification.findAll()
  const danglingNotif = notifRows.filter((n) => {
    const m = /appointment #(\d+)/.exec(n.message ?? '')
    return m !== null && !liveApptIds.has(Number(m[1]))
  })
  for (const n of danglingNotif) await n.destroy()
  bump('danglingBarberNotifications', danglingNotif.length)

  console.log('\n=== removed ===')
  for (const [k, v] of Object.entries(tally).sort()) if (v) console.log(`   ${k}: ${v}`)
  console.log(`   TOTAL: ${removed}`)

  // ---------- final state ----------
  console.log('\n=== remaining (real data) ===')
  type AnyModel = { name: string; count: () => Promise<number> }
  const remaining: AnyModel[] = [Admin, Barber, Customer, Service, Appointment, Payment, Review, Gallery, ContactMessage, ContactReply, BarberService, BarberAvailability, BarberEarning, BarberNotification, CheckoutSession, CustomerOtp] as unknown as AnyModel[]
  for (const m of remaining) {
    console.log(`   ${m.name}: ${await m.count()}`)
  }
  await sequelize.close()
}

main().catch((err) => { console.error(err); process.exit(1) })
