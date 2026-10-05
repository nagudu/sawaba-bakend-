import { Appointment, Payment, Service } from '../models'
import { UnprocessableError, NotFoundError } from '../utils/errors'
import { serializeAppointment } from './appointmentService'
import { getCustomerStats } from './customerService'
import { markPaymentCancelled } from './paymentService'
import { AppointmentStatusValue } from '../config/appointmentStatuses'
import type { Customer as CustomerModel } from '../models/Customer'

/** Appointment statuses a customer may cancel themselves. */
const CUSTOMER_CANCELLABLE = new Set<string>([
  AppointmentStatusValue.PAYMENT_REQUIRED,
  AppointmentStatusValue.PAYMENT_SUBMITTED,
  AppointmentStatusValue.PAYMENT_VERIFIED,
  AppointmentStatusValue.PAYMENT_REJECTED,
  AppointmentStatusValue.READY_FOR_SERVICE,
])

function daysAgoLabel(date: Date): string {
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 30) return `${diffDays} days ago`
  const months = Math.floor(diffDays / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

/** Everything the customer dashboard needs in one call (always customer-scoped). */
export async function getCustomerSummary(customer: CustomerModel): Promise<Record<string, unknown>> {
  const [appointments, stats] = await Promise.all([
    Appointment.findAll({
      where: { customerId: customer.id },
      include: [
        { model: (await import('../models')).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
        { model: (await import('../models')).Barber, as: 'barber', attributes: ['id', 'name', 'image'] },
        // Customer-safe assignment info (#15): name/image only.
        { model: (await import('../models')).Barber, as: 'assignedBarber', attributes: ['id', 'name', 'image'] },
        { model: Payment, as: 'payment', attributes: ['id', 'status', 'amount', 'paymentMethod', 'accessToken'] },
      ],
      order: [
        ['appointmentDate', 'DESC'],
        ['appointmentTime', 'DESC'],
      ],
      limit: 200,
    }),
    getCustomerStats(customer.id),
  ])

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const serialized = appointments.map(serializeAppointment)
  const upcoming = serialized
    .filter(
      (a) =>
        a.status !== 'COMPLETED' &&
        a.status !== 'CANCELLED' &&
        (a.appointmentDate > today ||
          (a.appointmentDate === today && a.appointmentTime >= now.toTimeString().slice(0, 5))),
    )
    .sort((a, b) =>
      a.appointmentDate === b.appointmentDate
        ? a.appointmentTime.localeCompare(b.appointmentTime)
        : a.appointmentDate.localeCompare(b.appointmentDate),
    )
  const past = serialized.filter((a) => !upcoming.includes(a))

  // "Book Again": most frequent service across history (not forced — just a suggestion).
  const counts = new Map<number, { count: number; last: Appointment }>()
  for (const appointment of appointments) {
    const entry = counts.get(appointment.serviceId)
    if (entry) {
      entry.count += 1
      if (appointment.appointmentDate > entry.last.appointmentDate) entry.last = appointment
    } else {
      counts.set(appointment.serviceId, { count: 1, last: appointment })
    }
  }
  let usual: Record<string, unknown> | null = null
  const favoriteId = customer.favoriteServiceId
  if (favoriteId) {
    const fav = appointments.find((a) => a.serviceId === favoriteId)
    if (fav) {
      usual = {
        service: { id: fav.serviceId, name: fav.service?.name ?? 'Service', price: Number(fav.service?.price ?? 0) },
        timesBooked: counts.get(favoriteId)?.count ?? 1,
        lastBooked: daysAgoLabel(new Date(`${fav.appointmentDate}T12:00:00`)),
        appointmentId: fav.id,
        barberId: fav.barberId,
        isFavorite: true,
      }
    }
  }
  if (!usual && counts.size) {
    const [serviceId, entry] = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0]
    usual = {
      service: {
        id: serviceId,
        name: entry.last.service?.name ?? 'Service',
        price: Number(entry.last.service?.price ?? 0),
      },
      timesBooked: entry.count,
      lastBooked: daysAgoLabel(new Date(`${entry.last.appointmentDate}T12:00:00`)),
      appointmentId: entry.last.id,
      barberId: entry.last.barberId,
      isFavorite: false,
    }
  }

  return {
    customer: {
      id: customer.id,
      customerCode: customer.customerCode ?? `CUS-${String(customer.id).padStart(4, '0')}`,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      avatarUrl: customer.avatarUrl,
      preferredBarberId: customer.preferredBarberId,
      favoriteServiceId: customer.favoriteServiceId,
      reminderOptIn: customer.reminderOptIn,
      createdAt: customer.createdAt,
    },
    stats,
    upcoming: upcoming.slice(0, 5),
    upcomingCount: upcoming.length,
    recent: past.slice(0, 6),
    usual,
  }
}

/** Full paginated booking history for the logged-in customer. */
export async function getCustomerAppointments(
  customer: CustomerModel,
  query: { page?: number; perPage?: number },
): Promise<Record<string, unknown>> {
  const page = Math.max(1, Number(query.page) || 1)
  const perPage = Math.min(50, Math.max(1, Number(query.perPage) || 20))

  const { rows, count } = await Appointment.findAndCountAll({
    where: { customerId: customer.id },
    include: [
      { model: (await import('../models')).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
      { model: (await import('../models')).Barber, as: 'barber', attributes: ['id', 'name', 'image'] },
      { model: (await import('../models')).Barber, as: 'assignedBarber', attributes: ['id', 'name', 'image'] },
      { model: Payment, as: 'payment' },
    ],
    order: [
      ['appointmentDate', 'DESC'],
      ['appointmentTime', 'DESC'],
    ],
    offset: (page - 1) * perPage,
    limit: perPage,
  })

  return {
    items: rows.map(serializeAppointment),
    total: count,
    page,
    perPage,
  }
}

/** Payment history with receipt access — strictly scoped to this customer. */
export async function getCustomerPayments(
  customer: CustomerModel,
  query: { page?: number; perPage?: number },
): Promise<Record<string, unknown>> {
  const page = Math.max(1, Number(query.page) || 1)
  const perPage = Math.min(50, Math.max(1, Number(query.perPage) || 20))

  const { rows, count } = await Payment.findAndCountAll({
    where: { customerId: customer.id },
    include: [
      {
        model: (await import('../models')).Appointment,
        as: 'appointment',
        attributes: ['id', 'referenceCode', 'customerName', 'appointmentDate', 'appointmentTime', 'status'],
        include: [
          {
            model: (await import('../models')).Service,
            as: 'service',
            attributes: ['id', 'name', 'price'],
          },
          {
            model: (await import('../models')).Barber,
            as: 'barber',
            attributes: ['id', 'name'],
          },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * perPage,
    limit: perPage,
  })

  // accessToken IS included deliberately: it is the customer's own payment-
  // page key, letting them open /pay and /receipt pages for their records.
  return {
    items: rows.map((payment) => ({
      id: payment.id,
      appointmentId: payment.appointmentId,
      accessToken: payment.accessToken,
      referenceCode: payment.appointment?.referenceCode ?? null,
      customerName: payment.appointment?.customerName ?? customer.fullName,
      serviceName: payment.appointment?.service?.name ?? null,
      servicePrice: payment.appointment?.service ? Number(payment.appointment.service.price) : null,
      barberName: payment.appointment?.barber?.name ?? null,
      appointmentDate: payment.appointment?.appointmentDate ?? null,
      appointmentTime: payment.appointment?.appointmentTime ?? null,
      amount: Number(payment.amount),
      paymentMethod: payment.paymentMethod,
      transactionReference: payment.transactionReference,
      paymentDate: payment.paymentDate,
      status: payment.status,
      receiptUrl: payment.receiptUrl,
      verifiedAt: payment.verifiedAt,
      createdAt: payment.createdAt,
    })),
    total: count,
    page,
    perPage,
  }
}

/** Single appointment detail — strictly scoped to the logged-in customer. */
export async function getCustomerAppointmentById(
  customer: CustomerModel,
  appointmentId: number,
): Promise<Record<string, unknown>> {
  const appointment = await Appointment.findByPk(appointmentId, {
    include: [
      {
        model: (await import('../models')).Service,
        as: 'service',
        attributes: ['id', 'name', 'price', 'duration'],
      },
      {
        model: (await import('../models')).Barber,
        as: 'barber',
        attributes: ['id', 'name', 'image'],
      },
      {
        model: (await import('../models')).Barber,
        as: 'assignedBarber',
        attributes: ['id', 'name', 'image'],
      },
      {
        model: Payment,
        as: 'payment',
        // Include the accessToken so the frontend can open /pay/:token directly.
        attributes: ['id', 'status', 'amount', 'paymentMethod', 'transactionReference',
          'paymentDate', 'receiptUrl', 'rejectionReason', 'verifiedAt', 'accessToken'],
      },
    ],
  })

  // Return an identical 404 whether the appointment doesn't exist or belongs
  // to a different customer — prevents ID enumeration.
  if (!appointment || appointment.customerId !== customer.id) {
    throw new NotFoundError('Appointment not found.')
  }

  return serializeAppointment(appointment) as unknown as Record<string, unknown>
}

/** Customer cancels their own appointment — backend re-checks every rule. */
export async function cancelOwnAppointment(
  customer: CustomerModel,
  appointmentId: number,
  reason: string | null,
): Promise<Record<string, unknown>> {
  const appointment = await Appointment.findByPk(appointmentId)
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }
  if (appointment.customerId !== customer.id) {
    // Deliberately identical to "not found" so IDs cannot be probed.
    throw new NotFoundError('Appointment not found.')
  }
  if (!CUSTOMER_CANCELLABLE.has(appointment.status as string)) {
    throw new UnprocessableError(
      appointment.status === 'COMPLETED'
        ? 'This appointment is already completed and cannot be cancelled.'
        : appointment.status === 'CANCELLED'
          ? 'This appointment is already cancelled.'
          : 'This appointment can no longer be cancelled online. Please call the salon.',
    )
  }

  await appointment.update({
    status: AppointmentStatusValue.CANCELLED,
    cancelledAt: new Date(),
    cancellationReason: reason ?? 'Cancelled by customer',
    cancelledBy: null,
  })
  await markPaymentCancelled(appointment.id)

  const fresh = await Appointment.findByPk(appointment.id, {
    include: [
      { model: (await import('../models')).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
      { model: (await import('../models')).Barber, as: 'barber', attributes: ['id', 'name', 'image'] },
      { model: Payment, as: 'payment', attributes: ['id', 'status', 'amount', 'paymentMethod', 'accessToken'] },
    ],
  })
  return serializeAppointment(fresh!) as unknown as Record<string, unknown>
}

/**
 * Booking prefill for a logged-in customer: identity plus their usual
 * service/barber so the booking form starts 90% complete.
 */
export async function getBookingPrefill(customer: CustomerModel): Promise<Record<string, unknown>> {
  const [lastAppointment, recentServices] = await Promise.all([
    Appointment.findOne({
      where: { customerId: customer.id },
      order: [['createdAt', 'DESC']],
      include: [
        { model: (await import('../models')).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
        { model: (await import('../models')).Barber, as: 'barber', attributes: ['id', 'name'] },
      ],
    }),
    Appointment.findAll({
      where: { customerId: customer.id },
      attributes: ['serviceId'],
      group: ['serviceId'],
      order: [],
      raw: true,
    }),
  ])

  let usualService: { id: number; name: string; price: number; duration: number } | null = null
  let usualBarberId: number | null = null
  if (lastAppointment?.service) {
    usualService = {
      id: lastAppointment.service.id,
      name: lastAppointment.service.name,
      price: Number(lastAppointment.service.price),
      duration: lastAppointment.service.duration,
    }
    usualBarberId = lastAppointment.barberId
  }
  // An explicit favorite overrides recency.
  if (customer.favoriteServiceId && (!usualService || customer.favoriteServiceId !== usualService.id)) {
    const fav = await Service.findByPk(customer.favoriteServiceId)
    if (fav) {
      usualService = { id: fav.id, name: fav.name, price: Number(fav.price), duration: fav.duration }
    }
  }

  return {
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email,
    usualService,
    usualBarberId,
    preferredBarberId: customer.preferredBarberId,
    recentServiceIds: recentServices.map((r) => Number(r.serviceId)),
  }
}
