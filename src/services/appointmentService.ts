import crypto from 'node:crypto'
import { prisma } from '../config/database'
import type { Prisma, AppointmentStatus, PaymentMethod, PaymentStatus } from '@prisma/client'
import { ConflictError, NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'
import { hhmmToMinutes } from './availabilityService'
import { findOrCreateCustomer } from './customerService'
import { markPaymentCancelled } from './paymentService'
import { createEarningSnapshot, syncEarningForAppointment } from './commissionService'
import { uploadImageToCloudinary } from '../utils/upload'
import { getPaymentSettingsRecord } from './paymentSettingsService'
import {
  APPOINTMENT_STATUSES,
  canTransition,
  AppointmentStatusValue,
  PAID_GATED_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  getValidNextStatuses,
} from '../config/appointmentStatuses'
import type { CreateAppointmentInput, UpdateAppointmentInput } from '../validators/appointment'
import type { Paged } from '../types'

function generatePaymentToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

function dateKey(date: string): string {
  return date.replace(/-/g, '')
}

async function generateReferenceCode(appointmentDate: string): Promise<string> {
  const key = dateKey(appointmentDate)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dayCount = await prisma.appointment.count({ where: { appointmentDate } })
    const candidate = `APT-${key}-${String(dayCount + 1 + attempt).padStart(3, '0')}`
    const taken = await prisma.appointment.findUnique({ where: { referenceCode: candidate } })
    if (!taken) return candidate
  }
  const salt = crypto.randomBytes(2).toString('hex').toUpperCase()
  return `APT-${key}-${salt}`
}

export interface AppointmentPublic {
  id: number
  referenceCode: string | null
  customerName: string
  customerPhone: string
  customerEmail: string | null
  customerId: number | null
  serviceId: number
  barberId: number
  appointmentDate: string
  appointmentTime: string
  totalAmount: number
  notes: string | null
  status: AppointmentStatus
  serviceStartedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  cancellationReason: string | null
  cancelledBy: number | null
  createdAt: Date
  updatedAt: Date
  service?: { id: number; name: string; price: number; duration: number }
  barber?: { id: number; name: string; image: string | null }
  payment?: null | {
    id: number
    status: PaymentStatus
    amount: number
    paymentMethod: PaymentMethod | null
    accessToken: string
  }
  /** ── Admin-only block (requirement #23) — stripped from customer-visible payloads. ── */
  customerLocation?: string | null
  assignedBarberId?: number | null
  assignedBarber?: { id: number; name: string; image: string | null; barberType?: string; location?: string | null } | null
  assignedAt?: Date | null
  earning?: {
    commissionType: string
    commissionRateSnapshot: number
    serviceAmount: number
    commissionAmount: number
    studioAmount: number
    status: string
  } | null
}

export interface BookingConfirmation {
  appointment: AppointmentPublic
  payment: { id: number; accessToken: string; amount: number; status: PaymentStatus }
}

const customerAppointmentInclude = {
  service: { select: { id: true, name: true, price: true, duration: true } },
  barber: { select: { id: true, name: true, image: true } },
  assignedBarber: { select: { id: true, name: true, image: true } },
  payment: { select: { id: true, status: true, amount: true, paymentMethod: true, accessToken: true } },
} as const

type AppointmentWithCustomerRelations = Prisma.AppointmentGetPayload<{
  include: typeof customerAppointmentInclude
}>

export const adminAppointmentInclude = {
  service: { select: { id: true, name: true, price: true, duration: true } },
  barber: { select: { id: true, name: true, image: true, barberType: true, location: true } },
  assignedBarber: { select: { id: true, name: true, image: true, barberType: true, location: true } },
  payment: { select: { id: true, status: true, amount: true, paymentMethod: true, accessToken: true } },
  earning: true,
} as const

type AppointmentWithAdminRelations = Prisma.AppointmentGetPayload<{
  include: typeof adminAppointmentInclude
}>

export function serializeAppointment(appointment: AppointmentWithCustomerRelations | AppointmentWithAdminRelations): AppointmentPublic {
  const base: AppointmentPublic = {
    id: appointment.id,
    referenceCode: appointment.referenceCode,
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    customerEmail: appointment.customerEmail,
    customerId: appointment.customerId,
    serviceId: appointment.serviceId,
    barberId: appointment.barberId,
    appointmentDate: appointment.appointmentDate,
    appointmentTime: appointment.appointmentTime,
    totalAmount: Number(appointment.totalAmount),
    notes: appointment.notes,
    status: appointment.status,
    serviceStartedAt: appointment.serviceStartedAt,
    completedAt: appointment.completedAt,
    cancelledAt: appointment.cancelledAt,
    cancellationReason: appointment.cancellationReason,
    cancelledBy: appointment.cancelledBy,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  }

  // Customer-safe assigned-barber info (#15): name/image only
  if (appointment.assignedBarber) {
    base.assignedBarberId = appointment.assignedBarber.id
    base.assignedBarber = {
      id: appointment.assignedBarber.id,
      name: appointment.assignedBarber.name,
      image: appointment.assignedBarber.image,
    }
  }

  if (appointment.service) {
    base.service = {
      id: appointment.service.id,
      name: appointment.service.name,
      price: Number(appointment.service.price),
      duration: appointment.service.duration,
    }
  }
  if (appointment.barber) {
    base.barber = {
      id: appointment.barber.id,
      name: appointment.barber.name,
      image: appointment.barber.image,
    }
  }
  if (appointment.payment) {
    base.payment = {
      id: appointment.payment.id,
      status: appointment.payment.status,
      amount: Number(appointment.payment.amount),
      paymentMethod: appointment.payment.paymentMethod,
      accessToken: appointment.payment.accessToken,
    }
  }

  return base
}

/** Admin view — adds customer location, assignment data and the commission breakdown */
export function serializeAppointmentForAdmin(appointment: AppointmentWithAdminRelations): AppointmentPublic {
  const base = serializeAppointment(appointment)

  base.customerLocation = appointment.customerLocation ?? null
  base.assignedBarberId = appointment.assignedBarberId ?? null
  base.assignedAt = appointment.assignedAt ?? null

  if (appointment.assignedBarber) {
    base.assignedBarber = {
      id: appointment.assignedBarber.id,
      name: appointment.assignedBarber.name,
      image: appointment.assignedBarber.image,
      barberType: appointment.assignedBarber.barberType ?? 'INTERNAL',
      location: appointment.assignedBarber.location ?? null,
    }
  }

  if (appointment.earning) {
    base.earning = {
      commissionType: appointment.earning.commissionType,
      commissionRateSnapshot: Number(appointment.earning.commissionRateSnapshot),
      serviceAmount: Number(appointment.earning.serviceAmount),
      commissionAmount: Number(appointment.earning.commissionAmount),
      studioAmount: Number(appointment.earning.studioAmount),
      status: appointment.earning.status,
    }
  }

  return base
}

interface SlotCheckResult {
  serviceDuration: number
  servicePrice: number
}

async function assertBookableSlot(
  barberId: number,
  serviceId: number | null,
  date: string,
  time: string,
  excludeAppointmentId?: number,
): Promise<SlotCheckResult> {
  const barber = await prisma.barber.findUnique({ where: { id: barberId } })
  if (!barber || !barber.isActive) {
    throw new UnprocessableError('The selected barber is not available.')
  }

  let serviceDuration = 0
  let servicePrice = 0
  if (serviceId !== null) {
    const service = await prisma.service.findUnique({ where: { id: serviceId } })
    if (!service || !service.isActive) {
      throw new UnprocessableError('The selected service is not available.')
    }
    serviceDuration = service.duration
    servicePrice = Number(service.price)

    const providerLink = await prisma.barberService.findFirst({ where: { barberId, serviceId } })
    const hasAnyServices = await prisma.barberService.findFirst({ where: { barberId } })
    if (hasAnyServices && !providerLink) {
      throw new UnprocessableError('This barber does not provide the selected service.')
    }
  }

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay()

  const hasAnyAvailability = await prisma.barberAvailability.findFirst({ where: { barberId } })

  if (hasAnyAvailability) {
    const availability = await prisma.barberAvailability.findFirst({
      where: { barberId, dayOfWeek, isAvailable: true },
    })
    if (!availability) {
      throw new UnprocessableError('The barber is not available on the requested day.')
    }
    if (time < availability.startTime || time >= availability.endTime) {
      throw new UnprocessableError('The requested time is outside the barber working hours.')
    }
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  if (date < todayISO) {
    throw new UnprocessableError('Appointments cannot be booked in the past.')
  }

  const start = hhmmToMinutes(time)

  const existing = await prisma.appointment.findMany({
    where: {
      barberId,
      appointmentDate: date,
      status: { not: AppointmentStatusValue.CANCELLED },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
  })

  const serviceIds = [...new Set(existing.map((a) => a.serviceId))]
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } })
  const serviceMap = new Map(services.map((s) => [s.id, s.duration]))

  const end = start + serviceDuration

  const conflict = existing.find((appointment) => {
    const existingStart = hhmmToMinutes(appointment.appointmentTime)
    const existingEnd =
      existingStart + (serviceMap.get(appointment.serviceId) ?? serviceDuration)
    return start < existingEnd && end > existingStart
  })

  if (conflict) {
    throw new ConflictError(
      'This time slot is no longer available. Please choose another time.',
    )
  }

  return { serviceDuration, servicePrice }
}

export async function createAppointment(
  input: CreateAppointmentInput,
  receiptBuffer: Buffer | null = null,
  receiptMimetype: string | null = null,
): Promise<BookingConfirmation> {
  const paymentMethod = input.paymentMethod

  const settings = await getPaymentSettingsRecord()
  const enabled = (settings.enabledPaymentMethods ?? []) as PaymentMethod[]

  const isCash = paymentMethod === 'CASH'
  const isOnline = paymentMethod === 'ONLINE'

  if (isOnline) {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      throw new UnprocessableError(
        'Online payment is not available right now. Please choose another payment method.',
      )
    }
  } else if (enabled.length > 0 && !enabled.includes(paymentMethod as PaymentMethod)) {
    throw new UnprocessableError('This payment method is not currently accepted. Please choose another method.')
  }

  if (!isCash && !isOnline && !receiptBuffer) {
    throw new UnprocessableError(
      'Payment receipt is required before you can submit your appointment. Please upload your transfer receipt.',
    )
  }

  const { servicePrice } = await assertBookableSlot(
    input.barberId,
    input.serviceId,
    input.appointmentDate,
    input.appointmentTime,
  )

  let receiptUrl: string | null = null
  let receiptPublicId: string | null = null
  if (receiptBuffer) {
    const uploaded = await uploadImageToCloudinary(
      receiptBuffer,
      'sawaba-receipts',
      receiptMimetype ?? 'image/jpeg',
    )
    receiptUrl = uploaded.url
    receiptPublicId = uploaded.publicId
  }

  const customer = await findOrCreateCustomer({
    fullName: input.customerName,
    phone: input.customerPhone,
    email: input.customerEmail ?? null,
  })

  const referenceCode = await generateReferenceCode(input.appointmentDate)

  const appointment = await prisma.appointment.create({
    data: {
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? null,
      customerLocation: input.customerLocation ?? null,
      customerId: customer.id,
      serviceId: input.serviceId,
      barberId: input.barberId,
      appointmentDate: input.appointmentDate,
      appointmentTime: input.appointmentTime,
      totalAmount: servicePrice,
      notes: input.notes ?? null,
      status: !isCash && !isOnline ? AppointmentStatusValue.PAYMENT_SUBMITTED : AppointmentStatusValue.PAYMENT_REQUIRED,
      referenceCode,
    },
  })

  const payment = await prisma.payment.create({
    data: {
      appointmentId: appointment.id,
      customerId: customer.id,
      amount: servicePrice,
      paymentMethod: paymentMethod as PaymentMethod,
      transactionReference: input.transactionReference || null,
      paymentDate: isCash || isOnline ? null : new Date().toISOString().slice(0, 10),
      receiptUrl,
      receiptPublicId,
      note: null,
      status: isCash || isOnline ? 'UNPAID' : 'PENDING_VERIFICATION',
      accessToken: generatePaymentToken(),
    },
  })

  // Commission snapshot (requirement #9) — frozen at booking time.
  await createEarningSnapshot(appointment.id, input.barberId, servicePrice)

  const fresh = await prisma.appointment.findUnique({
    where: { id: appointment.id },
    include: customerAppointmentInclude,
  })

  return {
    appointment: serializeAppointment(fresh!),
    payment: {
      id: payment.id,
      accessToken: payment.accessToken,
      amount: Number(payment.amount),
      status: payment.status,
    },
  }
}

export async function listAppointments(query: {
  status?: AppointmentStatus
  barberId?: number
  serviceId?: number
  customerLocation?: string
  from?: string
  to?: string
  search?: string
  page?: number
  perPage?: number
}): Promise<Paged<AppointmentPublic>> {
  const { page, perPage, offset, limit } = getPagination(query as Record<string, unknown>)

  const where: Prisma.AppointmentWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.barberId ? { barberId: query.barberId } : {}),
    ...(query.serviceId ? { serviceId: query.serviceId } : {}),
    ...(query.customerLocation ? { customerLocation: { contains: query.customerLocation } } : {}),
    ...(query.from || query.to
      ? {
          appointmentDate: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  }

  if (query.search?.trim()) {
    const search = query.search.trim()
    where.OR = [
      { referenceCode: { contains: search } },
      { customerName: { contains: search } },
      { customerPhone: { contains: search } },
      { customerEmail: { contains: search } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: adminAppointmentInclude,
      orderBy: [
        { appointmentDate: 'desc' },
        { appointmentTime: 'desc' },
      ],
      skip: offset,
      take: limit,
    }),
    prisma.appointment.count({ where }),
  ])

  return {
    items: rows.map(serializeAppointmentForAdmin),
    total,
    page,
    perPage,
  }
}

export async function getAppointmentById(id: number): Promise<AppointmentPublic> {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: adminAppointmentInclude,
  })
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }
  return serializeAppointmentForAdmin(appointment)
}

export async function updateAppointment(
  id: number,
  input: UpdateAppointmentInput,
): Promise<AppointmentPublic> {
  const appointment = await prisma.appointment.findUnique({ where: { id } })
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }

  if (input.appointmentDate || input.appointmentTime || input.barberId || input.serviceId) {
    const nextBarberId = input.barberId ?? appointment.barberId
    const nextServiceId = input.serviceId ?? appointment.serviceId
    const nextDate = input.appointmentDate ?? appointment.appointmentDate
    const nextTime = input.appointmentTime ?? appointment.appointmentTime
    await assertBookableSlot(nextBarberId, nextServiceId, nextDate, nextTime, id)
  }

  await prisma.appointment.update({
    where: { id },
    data: input,
  })

  return getAppointmentById(id)
}

const VALID_STATUSES: AppointmentStatus[] = APPOINTMENT_STATUSES

async function syncPaymentForStatus(
  appointmentId: number,
  status: AppointmentStatus,
  adminId?: number | null,
): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { appointmentId } })
  if (!payment) return

  if (status === AppointmentStatusValue.PAYMENT_VERIFIED && payment.status !== 'PAID') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        verifiedAt: new Date(),
        verifiedBy: adminId ?? null,
        rejectionReason: null,
      },
    })
  } else if (
    status === AppointmentStatusValue.PAYMENT_REJECTED &&
    (payment.status === 'PENDING_VERIFICATION' || payment.status === 'UNPAID')
  ) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'REJECTED', verifiedAt: null },
    })
  } else if (
    status === AppointmentStatusValue.PAYMENT_SUBMITTED &&
    payment.status !== 'PENDING_VERIFICATION' &&
    payment.status !== 'PAID'
  ) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'PENDING_VERIFICATION', rejectionReason: null },
    })
  } else if (
    PAID_GATED_STATUSES.includes(status) &&
    payment.status === 'UNPAID'
  ) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        verifiedAt: new Date(),
        verifiedBy: adminId ?? null,
        rejectionReason: null,
      },
    })
  }
}

function statusFieldsFor(status: AppointmentStatus): Record<string, unknown> {
  const now = new Date()
  switch (status) {
    case AppointmentStatusValue.IN_PROGRESS:
      return { serviceStartedAt: now }
    case AppointmentStatusValue.COMPLETED:
      return { completedAt: now }
    case AppointmentStatusValue.CANCELLED:
      return { cancelledAt: now }
    default:
      return {}
  }
}

export async function updateAppointmentStatus(
  id: number,
  status: AppointmentStatus,
  options: {
    cancellationReason?: string | null
    cancelledBy?: number | null
    updatedByAdminId?: number | null
  } = {},
): Promise<AppointmentPublic> {
  const appointment = await prisma.appointment.findUnique({ where: { id } })
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }

  const current = appointment.status
  if (!VALID_STATUSES.includes(current as AppointmentStatus)) {
    throw new UnprocessableError(
      `This appointment has an invalid status "${current}". Please contact support.`,
    )
  }

  if (current === AppointmentStatusValue.CANCELLED && status !== AppointmentStatusValue.CANCELLED) {
    throw new UnprocessableError(
      'This appointment has been cancelled. Please reactivate it before changing its status.',
    )
  }

  if (status === current) {
    return getAppointmentById(id)
  }

  if (!canTransition(current as AppointmentStatus, status)) {
    const suggestions = getValidNextStatuses(current as AppointmentStatus)
    const nextSteps = suggestions.length
      ? ` Available next steps: ${suggestions
          .map((next) => APPOINTMENT_STATUS_LABELS[next])
          .join(', ')}.`
      : ' This appointment is in a terminal state and its status can no longer change.'
    throw new UnprocessableError(
      `This appointment is currently ${APPOINTMENT_STATUS_LABELS[current as AppointmentStatus]} (${current}); it cannot move to ${APPOINTMENT_STATUS_LABELS[status]}.${nextSteps}`,
    )
  }

  if (PAID_GATED_STATUSES.includes(status)) {
    const payment = await prisma.payment.findUnique({ where: { appointmentId: id } })
    if (payment && (payment.status === 'REJECTED' || payment.status === 'CANCELLED')) {
      throw new UnprocessableError(
        `This payment was ${payment.status.toLowerCase()}, not verified. Verify the payment first (Payments page) or have the customer resubmit it before marking the appointment Ready for Service.`,
      )
    }
  }

  const fields: Prisma.AppointmentUpdateInput = {
    status,
    ...statusFieldsFor(status),
  }
  if (status === AppointmentStatusValue.CANCELLED) {
    fields.cancellationReason = options.cancellationReason ?? null
    fields.cancelledBy = options.cancelledBy ?? null
  }

  await prisma.appointment.update({
    where: { id },
    data: fields,
  })

  if (status === AppointmentStatusValue.CANCELLED) {
    await markPaymentCancelled(id)
    await syncEarningForAppointment(id)
  } else {
    await syncPaymentForStatus(id, status, options.updatedByAdminId)
    await syncEarningForAppointment(id)
  }

  return getAppointmentById(id)
}

export async function reactivateAppointment(id: number): Promise<AppointmentPublic> {
  const appointment = await prisma.appointment.findUnique({ where: { id } })
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }
  if (appointment.status !== AppointmentStatusValue.CANCELLED) {
    return getAppointmentById(id)
  }

  const payment = await prisma.payment.findUnique({ where: { appointmentId: id } })
  const nextStatus: AppointmentStatus =
    payment?.status === 'PAID'
      ? AppointmentStatusValue.READY_FOR_SERVICE
      : AppointmentStatusValue.PAYMENT_REQUIRED

  await prisma.appointment.update({
    where: { id },
    data: {
      status: nextStatus,
      cancelledAt: null,
      cancellationReason: null,
      cancelledBy: null,
    },
  })
  if (payment && payment.status === 'CANCELLED') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'UNPAID' },
    })
  }

  return getAppointmentById(id)
}

export async function deleteAppointment(id: number): Promise<void> {
  const appointment = await prisma.appointment.findUnique({ where: { id } })
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }
  await prisma.appointment.delete({ where: { id } })
}