import { prisma } from '../config/database'
import type { Customer } from '@prisma/client'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { serializeAppointment } from './appointmentService'
import { getCustomerStats } from './customerService'
import { sendEmail } from './mailer'

export async function getCustomerDetail(id: number): Promise<Record<string, unknown>> {
  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) throw new NotFoundError('Customer not found.')

  const [appointments, stats] = await Promise.all([
    prisma.appointment.findMany({
      where: { customerId: id },
      include: {
        service: { select: { id: true, name: true, price: true, duration: true } },
        barber: { select: { id: true, name: true, image: true } },
        assignedBarber: { select: { id: true, name: true, image: true, barberType: true, location: true } },
        payment: { select: { id: true, status: true, amount: true, paymentMethod: true, accessToken: true } },
      },
      orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
      take: 200,
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

export async function adminUpdateCustomer(
  id: number,
  patch: { fullName?: string; email?: string | null; isActive?: boolean; reminderOptIn?: boolean },
): Promise<Customer> {
  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) throw new NotFoundError('Customer not found.')

  const fields: {
    fullName?: string
    email?: string | null
    isActive?: boolean
    reminderOptIn?: boolean
  } = {}

  if (patch.fullName !== undefined && patch.fullName.trim()) fields.fullName = patch.fullName.trim()
  if (patch.email !== undefined) {
    const email = patch.email ? patch.email.trim().toLowerCase() : null
    if (email && email !== customer.email) {
      const taken = await prisma.customer.findFirst({ where: { email } })
      if (taken) throw new UnprocessableError('This email belongs to another customer.')
    }
    fields.email = email
  }
  if (patch.isActive !== undefined) fields.isActive = patch.isActive
  if (patch.reminderOptIn !== undefined) fields.reminderOptIn = patch.reminderOptIn

  return prisma.customer.update({
    where: { id },
    data: fields,
  })
}

export async function sendDueReminders(options: {
  dryRun?: boolean
} = {}): Promise<{ sent: number; skipped: number; results: Array<{ customer: string; phone: string; email: string | null }> }> {
  const customers = await prisma.customer.findMany({ where: { isActive: true, reminderOptIn: true } })
  const today = new Date()
  const results: Array<{ customer: string; phone: string; email: string | null }> = []
  let skipped = 0

  for (const customer of customers) {
    const appointments = await prisma.appointment.findMany({
      where: { customerId: customer.id, status: { not: 'CANCELLED' } },
      select: { appointmentDate: true, serviceId: true },
      orderBy: { appointmentDate: 'asc' },
    })
    if (appointments.length < 2) {
      skipped += 1
      continue
    }

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

    if (daysSince < avgGap - 2 || !customer.email) {
      skipped += 1
      continue
    }

    const last = appointments[appointments.length - 1]
    const service = await prisma.service.findUnique({
      where: { id: last.serviceId },
      select: { name: true },
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
