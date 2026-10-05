import { Op } from 'sequelize'
import { Appointment, Customer, Payment } from '../models'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { serializeAppointment } from './appointmentService'
import { getCustomerStats } from './customerService'
import { sendEmail } from './mailer'
import type { Customer as CustomerModel } from '../models/Customer'

/** Full customer bundle for the admin Customers page. */
export async function getCustomerDetail(id: number): Promise<Record<string, unknown>> {
  const customer = await Customer.findByPk(id)
  if (!customer) throw new NotFoundError('Customer not found.')

  const [appointments, stats] = await Promise.all([
    Appointment.findAll({
      where: { customerId: id },
      include: [
        { model: (await import('../models')).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
        { model: (await import('../models')).Barber, as: 'barber', attributes: ['id', 'name', 'image'] },
        { model: Payment, as: 'payment', attributes: ['id', 'status', 'amount', 'paymentMethod', 'accessToken'] },
      ],
      order: [
        ['appointmentDate', 'DESC'],
        ['appointmentTime', 'DESC'],
      ],
      limit: 200,
    }),
    getCustomerStats(id),
  ])

  const serialized = appointments.map(serializeAppointment)
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toTimeString().slice(0, 5)
  const upcoming = serialized.find(
    (a) =>
      a.status !== 'COMPLETED' &&
      a.status !== 'CANCELLED' &&
      (a.appointmentDate > today || (a.appointmentDate === today && a.appointmentTime >= now)),
  )

  const serviceCounts = new Map<number, { name: string; count: number }>()
  for (const appointment of appointments) {
    if (!appointment.service) continue
    const entry = serviceCounts.get(appointment.serviceId)
    if (entry) entry.count += 1
    else serviceCounts.set(appointment.serviceId, { name: appointment.service.name, count: 1 })
  }
  const favoriteServices = [...serviceCounts.entries()]
    .map(([serviceId, value]) => ({ serviceId, ...value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  return {
    customer: {
      id: customer.id,
      customerCode: customer.customerCode ?? `CUS-${String(customer.id).padStart(4, '0')}`,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      avatarUrl: customer.avatarUrl,
      reminderOptIn: customer.reminderOptIn,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
      lastLoginAt: customer.lastLoginAt,
    },
    stats,
    upcoming: upcoming ?? null,
    appointments: serialized,
    favoriteServices,
  }
}

/** Admin edits — never phone (identity anchor) or spend data. */
export async function adminUpdateCustomer(
  id: number,
  patch: { fullName?: string; email?: string | null; isActive?: boolean; reminderOptIn?: boolean },
): Promise<CustomerModel> {
  const customer = await Customer.findByPk(id)
  if (!customer) throw new NotFoundError('Customer not found.')

  const fields: Record<string, unknown> = {}
  if (patch.fullName !== undefined && patch.fullName.trim()) fields.fullName = patch.fullName.trim()
  if (patch.email !== undefined) {
    const email = patch.email ? patch.email.trim().toLowerCase() : null
    if (email && email !== customer.email) {
      const taken = await Customer.findOne({ where: { email } })
      if (taken) throw new UnprocessableError('This email belongs to another customer.')
    }
    fields.email = email
  }
  if (patch.isActive !== undefined) fields.isActive = patch.isActive
  if (patch.reminderOptIn !== undefined) fields.reminderOptIn = patch.reminderOptIn

  await customer.update(fields)
  return customer
}

/**
 * Sends the "book your usual" nudge to customers whose average visit gap has
 * elapsed since their last appointment. Never auto-books; opt-out respected.
 */
export async function sendDueReminders(options: {
  dryRun?: boolean
} = {}): Promise<{ sent: number; skipped: number; results: Array<{ customer: string; phone: string; email: string | null }> }> {
  const customers = await Customer.findAll({ where: { isActive: true, reminderOptIn: true } })
  const today = new Date()
  const results: Array<{ customer: string; phone: string; email: string | null }> = []
  let skipped = 0

  for (const customer of customers) {
    const appointments = await Appointment.findAll({
      where: { customerId: customer.id, status: { [Op.ne]: 'CANCELLED' } },
      attributes: ['appointmentDate', 'serviceId'],
      order: [['appointmentDate', 'ASC']],
    })
    if (appointments.length < 2) {
      skipped += 1
      continue
    }

    // Average gap in days between consecutive visits.
    const dates = appointments
      .map((a) => new Date(`${a.appointmentDate}T12:00:00`).getTime())
      .sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < dates.length; i += 1) {
      gaps.push((dates[i] - dates[i - 1]) / 86_400_000)
    }
    const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
    const lastVisit = dates[dates.length - 1]
    const daysSince = (today.getTime() - lastVisit) / 86_400_000

    // Due when the customer is within 2 days of their average rebooking rhythm.
    if (daysSince < avgGap - 2 || !customer.email) {
      skipped += 1
      continue
    }

    const last = appointments[appointments.length - 1]
    const service = await (await import('../models')).Service.findByPk(last.serviceId, {
      attributes: ['name'],
    })
    const firstName = customer.fullName.split(' ')[0]

    if (!options.dryRun) {
      await sendEmail({
        to: customer.email,
        subject: `Hi ${firstName} 👋 Time for your next grooming session?`,
        text: `Hello ${firstName},\n\nIt's almost time for your next grooming session — your usual${service ? ` ${service.name}` : ' service'} awaits. Would you like to book again?\n\nBook in seconds at our website, or just reply to this email.\n\nSAWABA Grooming Studio`,
        html: `<p>Hello ${firstName} 👋</p><p>It's almost time for your next grooming session — your usual<strong>${service ? ` ${service.name}` : ' service'}</strong> awaits.</p><p>Would you like to book again? It only takes a few seconds.</p><p style="color:#888;font-size:12px;">You are receiving this because you opted into booking reminders. Manage this in your profile.</p>`,
      })
    }

    results.push({ customer: customer.fullName, phone: customer.phone, email: customer.email })
  }

  return { sent: results.length, skipped, results }
}
