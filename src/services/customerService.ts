import { Op, type Transaction } from 'sequelize'
import { Appointment, Customer, Payment, Service, Barber } from '../models'
import { normalizeNigerianPhone, isPlausiblePhone } from '../utils/phone'
import { UnprocessableError } from '../utils/errors'

export interface CustomerInput {
  fullName: string
  phone: string
  email?: string | null
}

/** Normalizes input and looks up (or creates) the single customer per phone. */
export async function findOrCreateCustomer(input: CustomerInput, t?: Transaction): Promise<Customer> {
  const phone = normalizeNigerianPhone(input.phone)
  if (!isPlausiblePhone(phone)) {
    throw new UnprocessableError('Provide a valid phone number.')
  }

  const existing = await Customer.findOne({ where: { phone }, ...(t ? { transaction: t } : {}) })
  if (existing) {
    // Keep the appointment copy in sync with the most recent spelling of the
    // customer's name/email without overwriting a richer stored value.
    const patch: Record<string, string> = {}
    if (input.fullName && input.fullName !== existing.fullName) patch.fullName = input.fullName
    if (input.email && !existing.email) patch.email = input.email
    if (Object.keys(patch).length) await existing.update(patch, { transaction: t })
    return existing
  }

  return Customer.create(
    {
      fullName: input.fullName,
      phone,
      email: input.email ?? null,
    },
    t ? { transaction: t } : undefined,
  )
}

/** Stable display code CUS-0001 — a reference, never a security credential. */
export async function ensureCustomerCode(customer: Customer): Promise<string> {
  if (customer.customerCode) return customer.customerCode
  const padded = String(customer.id).padStart(4, '0')
  const candidate = `CUS-${padded}`
  if (!(await Customer.findOne({ where: { customerCode: candidate } }))) {
    await customer.update({ customerCode: candidate })
    return candidate
  }
  // Collision fallback (imported data etc.) — keep counting up.
  for (let n = customer.id + 1; ; n += 1) {
    const next = `CUS-${String(n).padStart(4, '0')}`
    if (!(await Customer.findOne({ where: { customerCode: next } }))) {
      await customer.update({ customerCode: next })
      return next
    }
  }
}

/** Backfills customerCode for every legacy customer lacking one. Idempotent. */
export async function backfillCustomerCodes(): Promise<number> {
  const missing = await Customer.findAll({ where: { customerCode: null } })
  for (const customer of missing) {
    await ensureCustomerCode(customer)
  }
  return missing.length
}

/** Merges appointment/payment phone copies into normalized customer accounts. Idempotent. */
export async function backfillCustomerLinks(): Promise<{ customers: number; appointments: number }> {
  // 1. normalize every stored customer phone
  const customers = await Customer.findAll()
  const seen = new Map<string, number>()
  let merged = 0
  for (const customer of customers) {
    const phone = normalizeNigerianPhone(customer.phone)
    if (phone !== customer.phone || seen.has(phone)) {
      const dup = seen.get(phone)
      if (dup) {
        // Two rows collapsed onto the same normalized phone: move appointments
        // and payments to the older account and retire the duplicate.
        await Appointment.update({ customerId: dup }, { where: { customerId: customer.id } })
        await Payment.update({ customerId: dup }, { where: { customerId: customer.id } })
        await customer.destroy()
        merged += 1
        continue
      }
      await customer.update({ phone })
    }
    seen.set(phone, customer.id)
  }

  // 2. link appointments that reference a known phone but have no customerId
  const unlinked = await Appointment.findAll({
    where: { customerId: null },
    attributes: ['id', 'customerName', 'customerPhone', 'customerEmail'],
  })
  for (const appointment of unlinked) {
    const phone = normalizeNigerianPhone(appointment.customerPhone)
    const customer =
      (await Customer.findOne({ where: { phone } })) ??
      (await Customer.create({
        fullName: appointment.customerName,
        phone,
        email: appointment.customerEmail ?? null,
      }))
    await appointment.update({
      customerId: customer.id,
      customerPhone: phone,
      customerName: appointment.customerName || customer.fullName,
    })
  }

  // 3. same for payments without a customer link
  const orphanPayments = await Payment.findAll({
    where: { customerId: null },
    include: [{ model: Appointment, as: 'appointment', attributes: ['id', 'customerId'] }],
  })
  for (const payment of orphanPayments) {
    if (payment.appointment?.customerId) {
      await payment.update({ customerId: payment.appointment.customerId })
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
  const appointments = await Appointment.findAll({
    where: { customerId },
    attributes: ['status'],
    include: [
      {
        model: Payment,
        as: 'payment',
        attributes: ['status', 'amount'],
        required: false,
      },
    ],
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

  const where = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          [Op.or]: [
            { fullName: { [Op.like]: `%${search}%` } },
            { phone: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } },
            { customerCode: { [Op.like]: `%${search}%` } },
            // Digit-only search matches normalized phone regardless of input format.
            ...(normalized.length >= 3 ? [{ phone: { [Op.like]: `%${normalized}%` } }] : []),
          ],
        }
      : {}),
  }

  const { rows, count } = await Customer.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * perPage,
    limit: perPage,
  })

  const items = await Promise.all(
    rows.map(async (customer) => {
      const stats = await getCustomerStats(customer.id)
      const last = await Appointment.findOne({
        where: { customerId: customer.id },
        order: [
          ['appointmentDate', 'DESC'],
          ['appointmentTime', 'DESC'],
        ],
        include: [
          { model: Payment, as: 'payment', attributes: ['status'] },
          { model: Service, as: 'service', attributes: ['id', 'name'] },
          { model: Barber, as: 'barber', attributes: ['id', 'name'] },
        ],
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
