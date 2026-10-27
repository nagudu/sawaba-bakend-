import { prisma } from '../config/database'
import type { Customer, Prisma } from '@prisma/client'
import { normalizeNigerianPhone, isPlausiblePhone } from '../utils/phone'
import { UnprocessableError } from '../utils/errors'

export interface CustomerInput {
  fullName: string
  phone: string
  email?: string | null
}

/** Case/whitespace-insensitive person-name comparison for identity matching. */
function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Resolves the customer record a booking should be linked to.
 *
 * A phone number is only a shared contact point — two different people (e.g.
 * Halifa Shuaibu and Sani Isah) can legitimately use the same SIM, so the
 * number alone must never decide identity. A record is reused only when the
 * name also matches AND the email addresses are compatible (at least one side
 * empty, or the same address). Otherwise a brand-new record is created, so
 * guest bookings never merge just because they share a phone number.
 */
export async function findOrCreateCustomer(
  input: CustomerInput,
  tx?: Prisma.TransactionClient,
): Promise<Customer> {
  const db = tx ?? prisma
  const phone = normalizeNigerianPhone(input.phone)
  if (!isPlausiblePhone(phone)) {
    throw new UnprocessableError('Provide a valid phone number.')
  }

  const wantedName = normalizeName(input.fullName)
  const wantedEmail = input.email?.trim().toLowerCase() || null

  const candidates = await db.customer.findMany({ where: { phone } })
  const existing = candidates.find((record) => {
    if (normalizeName(record.fullName) !== wantedName) return false
    const recordEmail = record.email?.trim().toLowerCase() || null
    // Same name but both sides carry different addresses → treat as distinct.
    if (recordEmail && wantedEmail && recordEmail !== wantedEmail) return false
    return true
  })

  if (existing) {
    const patch: { fullName?: string; email?: string } = {}
    const trimmedName = input.fullName.trim()
    if (trimmedName && trimmedName !== existing.fullName) patch.fullName = trimmedName
    if (!existing.email && wantedEmail) patch.email = wantedEmail
    if (Object.keys(patch).length > 0) {
      return db.customer.update({
        where: { id: existing.id },
        data: patch,
      })
    }
    return existing
  }

  // Different person sharing this phone number — give them their own record.
  return db.customer.create({
    data: {
      fullName: input.fullName.trim(),
      phone,
      email: wantedEmail,
    },
  })
}

export async function ensureCustomerCode(
  customer: Customer,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const db = tx ?? prisma
  if (customer.customerCode) return customer.customerCode
  const padded = String(customer.id).padStart(4, '0')
  const candidate = `CUS-${padded}`
  const existing = await db.customer.findUnique({ where: { customerCode: candidate } })
  if (!existing) {
    await db.customer.update({
      where: { id: customer.id },
      data: { customerCode: candidate },
    })
    return candidate
  }

  for (let n = customer.id + 1; ; n += 1) {
    const next = `CUS-${String(n).padStart(4, '0')}`
    const taken = await db.customer.findUnique({ where: { customerCode: next } })
    if (!taken) {
      await db.customer.update({
        where: { id: customer.id },
        data: { customerCode: next },
      })
      return next
    }
  }
}

export async function backfillCustomerCodes(): Promise<number> {
  const missing = await prisma.customer.findMany({ where: { customerCode: null } })
  for (const customer of missing) {
    await ensureCustomerCode(customer)
  }
  return missing.length
}

export async function backfillCustomerLinks(): Promise<{ customers: number; appointments: number }> {
  const customers = await prisma.customer.findMany()
  // Keyed by full identity (phone + name + email), NOT phone alone: a shared
  // phone number must never collapse two different people into one record.
  const seen = new Map<string, number>()
  let merged = 0

  for (const customer of customers) {
    const phone = normalizeNigerianPhone(customer.phone)
    const identityKey = `${phone}|${normalizeName(customer.fullName)}|${
      customer.email?.trim().toLowerCase() ?? ''
    }`
    const dup = seen.get(identityKey)
    if (dup) {
      await prisma.appointment.updateMany({
        where: { customerId: customer.id },
        data: { customerId: dup },
      })
      await prisma.payment.updateMany({
        where: { customerId: customer.id },
        data: { customerId: dup },
      })
      await prisma.customer.delete({ where: { id: customer.id } })
      merged += 1
      continue
    }
    if (phone !== customer.phone) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { phone },
      })
    }
    seen.set(identityKey, customer.id)
  }

  const unlinked = await prisma.appointment.findMany({
    where: { customerId: null },
    select: { id: true, customerName: true, customerPhone: true, customerEmail: true },
  })

  for (const appointment of unlinked) {
    const phone = normalizeNigerianPhone(appointment.customerPhone)
    // Same identity rule as booking time — never phone-only matching.
    const customer = await findOrCreateCustomer({
      fullName: appointment.customerName,
      phone,
      email: appointment.customerEmail ?? null,
    })
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        customerId: customer.id,
        customerPhone: phone,
        customerName: appointment.customerName || customer.fullName,
      },
    })
  }

  const orphanPayments = await prisma.payment.findMany({
    where: { customerId: null },
    include: { appointment: { select: { id: true, customerId: true } } },
  })

  for (const payment of orphanPayments) {
    if (payment.appointment?.customerId) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { customerId: payment.appointment.customerId },
      })
    }
  }

  await backfillCustomerCodes()
  return { customers: seen.size, appointments: unlinked.length }
}

export interface CustomerStats {
  totalAppointments: number
  completed: number
  cancelled: number
  pending: number
  totalSpent: number
}

export async function getCustomerStats(customerId: number): Promise<CustomerStats> {
  const appointments = await prisma.appointment.findMany({
    where: { customerId },
    select: {
      status: true,
      payment: {
        select: { status: true, amount: true },
      },
    },
  })

  let completed = 0
  let cancelled = 0
  let pending = 0
  let totalSpent = 0

  for (const appointment of appointments) {
    const status = appointment.status as string
    if (status === 'COMPLETED') completed += 1
    else if (status === 'CANCELLED') cancelled += 1
    else pending += 1

    if (appointment.payment?.status === 'PAID') {
      totalSpent += Number(appointment.payment.amount)
    }
  }

  return { totalAppointments: appointments.length, completed, cancelled, pending, totalSpent }
}

export async function listCustomers(query: {
  search?: string
  page?: number
  perPage?: number
  includeInactive?: boolean
}): Promise<{
  items: Array<Record<string, unknown>>
  total: number
  page: number
  perPage: number
}> {
  const page = Math.max(1, query.page || 1)
  const perPage = Math.min(100, Math.max(1, query.perPage || 20))

  const search = query.search?.trim()
  const normalized = search ? normalizeNigerianPhone(search) : ''

  const where: {
    isActive?: boolean
    OR?: Array<{
      fullName?: { contains: string }
      phone?: { contains: string }
      email?: { contains: string }
      customerCode?: { contains: string }
    }>
  } = {}

  if (!query.includeInactive) {
    where.isActive = true
  }

  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { phone: { contains: search } },
      { email: { contains: search } },
      { customerCode: { contains: search } },
      ...(normalized.length >= 3 ? [{ phone: { contains: normalized } }] : []),
    ]
  }

  const [rows, count] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.customer.count({ where }),
  ])

  const items = await Promise.all(
    rows.map(async (customer) => {
      const stats = await getCustomerStats(customer.id)
      const last = await prisma.appointment.findFirst({
        where: { customerId: customer.id },
        orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
        include: {
          payment: { select: { status: true } },
          service: { select: { id: true, name: true } },
          barber: { select: { id: true, name: true } },
        },
      })
      return {
        id: customer.id,
        customerCode: customer.customerCode ?? `CUS-${String(customer.id).padStart(4, '0')}`,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        isActive: customer.isActive,
        createdAt: customer.createdAt,
        stats,
        lastVisit: last
          ? {
              id: last.id,
              date: last.appointmentDate,
              status: last.status,
              serviceName: last.service?.name ?? null,
              barberName: last.barber?.name ?? null,
            }
          : null,
      }
    }),
  )

  return { items, total: count, page, perPage }
}
