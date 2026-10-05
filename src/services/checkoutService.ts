import crypto from 'node:crypto'
import { prisma } from '../config/database'
import type { Prisma, PaymentMethod } from '@prisma/client'
import { ConflictError, NotFoundError, UnprocessableError } from '../utils/errors'
import { hhmmToMinutes } from './availabilityService'
import { findOrCreateCustomer } from './customerService'
import { createEarningSnapshot } from './commissionService'
import { uploadImageToCloudinary } from '../utils/upload'
import { getPaymentSettingsRecord } from './paymentSettingsService'
import { AppointmentStatusValue } from '../config/appointmentStatuses'

function generateSessionToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

function dateKey(date: string): string {
  return date.replace(/-/g, '')
}

async function generateReferenceCode(
  appointmentDate: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  const key = dateKey(appointmentDate)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dayCount = await tx.appointment.count({ where: { appointmentDate } })
    const candidate = `APT-${key}-${String(dayCount + 1 + attempt).padStart(3, '0')}`
    const taken = await tx.appointment.findUnique({ where: { referenceCode: candidate } })
    if (!taken) return candidate
  }
  const salt = crypto.randomBytes(2).toString('hex').toUpperCase()
  return `APT-${key}-${salt}`
}

/** Validates the barber/service/date/time and returns the authoritative price. Returns null when the slot is free. */
async function assertSessionBookable(
  barberId: number,
  serviceId: number,
  date: string,
  time: string,
  excludeAppointmentId?: number,
  excludeSessionId?: number,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ servicePrice: number; serviceDuration: number } | null> {
  const barber = await tx.barber.findUnique({ where: { id: barberId } })
  if (!barber || !barber.isActive) {
    throw new UnprocessableError('The selected barber is not available.')
  }

  const service = await tx.service.findUnique({ where: { id: serviceId } })
  if (!service || !service.isActive) {
    throw new UnprocessableError('The selected service is not available.')
  }

  const providerLink = await tx.barberService.findFirst({ where: { barberId, serviceId } })
  const hasAnyServices = await tx.barberService.findFirst({ where: { barberId } })
  if (hasAnyServices && !providerLink) {
    throw new UnprocessableError('This barber does not provide the selected service.')
  }

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay()
  const hasAnyAvailability = await tx.barberAvailability.findFirst({ where: { barberId } })
  if (hasAnyAvailability) {
    const availability = await tx.barberAvailability.findFirst({
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
  const end = start + service.duration

  const existing = await tx.appointment.findMany({
    where: {
      barberId,
      appointmentDate: date,
      status: { not: AppointmentStatusValue.CANCELLED },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
  })

  const openSessions = await tx.checkoutSession.findMany({
    where: {
      barberId,
      appointmentDate: date,
      status: 'AWAITING_PAYMENT',
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
    },
  })

  for (const session of openSessions) {
    const sessionStart = hhmmToMinutes(session.appointmentTime)
    const sessionEnd = sessionStart + service.duration
    if (start < sessionEnd && end > sessionStart) {
      return null // slot held by another in-progress checkout
    }
  }

  const serviceIds = [...new Set(existing.map((a) => a.serviceId))]
  const services = await tx.service.findMany({ where: { id: { in: serviceIds } } })
  const serviceMap = new Map(services.map((s) => [s.id, s.duration]))

  for (const appointment of existing) {
    const existingStart = hhmmToMinutes(appointment.appointmentTime)
    const existingEnd = existingStart + (serviceMap.get(appointment.serviceId) ?? service.duration)
    if (start < existingEnd && end > existingStart) {
      return null // slot taken by a real appointment
    }
  }

  return { servicePrice: Number(service.price), serviceDuration: service.duration }
}

export interface CheckoutSessionInput {
  customerName: string
  customerPhone: string
  customerEmail: string | null
  customerLocation: string | null
  serviceId: number
  barberId: number
  appointmentDate: string
  appointmentTime: string
  notes: string | null
  paymentMethod: PaymentMethod
  transactionReference: string | null
  receiptBuffer: Buffer | null
  receiptMimetype: string | null
}

export interface CheckoutSessionPublic {
  sessionToken: string
  totalAmount: number
  serviceName: string | null
  barberName: string | null
  appointmentDate: string
  appointmentTime: string
  status: string
  paystackReference: string | null
}

const sessionInclude = {
  service: { select: { id: true, name: true } },
  barber: { select: { id: true, name: true } },
} as const

type CheckoutSessionWithRelations = Prisma.CheckoutSessionGetPayload<{
  include: typeof sessionInclude
}>

function serializeSession(session: CheckoutSessionWithRelations): CheckoutSessionPublic {
  return {
    sessionToken: session.sessionToken,
    totalAmount: Number(session.totalAmount),
    serviceName: session.service?.name ?? null,
    barberName: session.barber?.name ?? null,
    appointmentDate: session.appointmentDate,
    appointmentTime: session.appointmentTime,
    status: session.status,
    paystackReference: session.paystackReference,
  }
}

async function loadSessionWithRelations(sessionToken: string): Promise<CheckoutSessionWithRelations> {
  const session = await prisma.checkoutSession.findUnique({
    where: { sessionToken },
    include: sessionInclude,
  })
  if (!session) {
    throw new NotFoundError('Booking session not found. Please start your booking again.')
  }
  return session
}

/**
 * Creates (or updates) the checkout session for the customer's chosen slot.
 * This writes NOTHING to appointments/payments — it is a temporary session.
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<CheckoutSessionPublic> {
  if (input.paymentMethod === 'ONLINE' && !process.env.PAYSTACK_SECRET_KEY) {
    throw new UnprocessableError(
      'Online payment is not available right now. Please choose another payment method.',
    )
  }

  const settings = await getPaymentSettingsRecord()
  const enabled = (settings.enabledPaymentMethods ?? []) as PaymentMethod[]
  if (input.paymentMethod !== 'ONLINE' && enabled.length > 0 && !enabled.includes(input.paymentMethod)) {
    throw new UnprocessableError('This payment method is not currently accepted. Please choose another method.')
  }

  const isCash = input.paymentMethod === 'CASH'
  if (!isCash && input.paymentMethod !== 'ONLINE' && !input.receiptBuffer) {
    throw new UnprocessableError('Payment receipt is required before you can submit your appointment.')
  }

  const slot = await assertSessionBookable(
    input.barberId,
    input.serviceId,
    input.appointmentDate,
    input.appointmentTime,
  )
  if (!slot) {
    throw new ConflictError('This time slot is no longer available. Please choose another time.')
  }

  let receiptUrl: string | null = null
  let receiptPublicId: string | null = null
  if (input.receiptBuffer) {
    const uploaded = await uploadImageToCloudinary(
      input.receiptBuffer,
      'sawaba-receipts',
      input.receiptMimetype ?? 'image/jpeg',
    )
    receiptUrl = uploaded.url
    receiptPublicId = uploaded.publicId
  }

  // Supersede stale in-flight sessions
  await prisma.checkoutSession.updateMany({
    where: {
      customerPhone: input.customerPhone,
      barberId: input.barberId,
      appointmentDate: input.appointmentDate,
      appointmentTime: input.appointmentTime,
      status: 'AWAITING_PAYMENT',
      updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
    },
    data: { status: 'EXPIRED' },
  })

  if (input.paymentMethod !== 'ONLINE') {
    await prisma.checkoutSession.updateMany({
      where: {
        customerPhone: input.customerPhone,
        barberId: input.barberId,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        status: 'AWAITING_PAYMENT',
        paymentMethod: 'ONLINE',
      },
      data: { status: 'EXPIRED' },
    })
  } else {
    const own = await prisma.checkoutSession.findFirst({
      where: {
        customerPhone: input.customerPhone,
        barberId: input.barberId,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        status: 'AWAITING_PAYMENT',
      },
      orderBy: { updatedAt: 'desc' },
    })
    if (own) {
      await prisma.checkoutSession.update({
        where: { id: own.id },
        data: {
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerLocation: input.customerLocation,
          serviceId: input.serviceId,
          notes: input.notes,
        },
      })
      return serializeSession(await loadSessionWithRelations(own.sessionToken))
    }
  }

  const existingOpen = await prisma.checkoutSession.findFirst({
    where: {
      customerPhone: input.customerPhone,
      appointmentDate: input.appointmentDate,
      appointmentTime: input.appointmentTime,
      barberId: input.barberId,
      status: 'OPEN',
    },
  })

  let sessionToken: string
  if (existingOpen) {
    sessionToken = existingOpen.sessionToken
    await prisma.checkoutSession.update({
      where: { id: existingOpen.id },
      data: {
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerLocation: input.customerLocation,
        serviceId: input.serviceId,
        notes: input.notes,
        totalAmount: slot.servicePrice,
        paymentMethod: input.paymentMethod,
        transactionReference: input.transactionReference,
        ...(receiptUrl ? { receiptUrl, receiptPublicId } : {}),
      },
    })
  } else {
    sessionToken = generateSessionToken()
    await prisma.checkoutSession.create({
      data: {
        sessionToken,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        customerLocation: input.customerLocation,
        serviceId: input.serviceId,
        barberId: input.barberId,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        notes: input.notes,
        totalAmount: slot.servicePrice,
        paymentMethod: input.paymentMethod,
        transactionReference: input.transactionReference,
        status: 'OPEN',
        receiptUrl,
        receiptPublicId,
      },
    })
  }

  return serializeSession(await loadSessionWithRelations(sessionToken))
}

export interface FinalizeResult {
  appointment: {
    id: number
    referenceCode: string | null
    status: string
    customerName: string
    appointmentDate: string
    appointmentTime: string
  }
  payment: { id: number; accessToken: string; amount: number; status: string }
  sessionToken: string
}

export async function finalizeCheckout(sessionToken: string): Promise<FinalizeResult> {
  const session = await loadSessionWithRelations(sessionToken)

  if (session.status === 'CONVERTED') {
    if (session.convertedAppointmentId) {
      const existing = await prisma.appointment.findUnique({
        where: { id: session.convertedAppointmentId },
        include: { payment: true },
      })
      if (existing) {
        return {
          appointment: {
            id: existing.id,
            referenceCode: existing.referenceCode,
            status: existing.status,
            customerName: existing.customerName,
            appointmentDate: existing.appointmentDate,
            appointmentTime: existing.appointmentTime,
          },
          payment: {
            id: existing.payment?.id ?? 0,
            accessToken: existing.payment?.accessToken ?? '',
            amount: Number(existing.payment?.amount ?? existing.totalAmount),
            status: existing.payment?.status ?? 'UNPAID',
          },
          sessionToken,
        }
      }
    }
    throw new ConflictError('This booking session has already been used.')
  }
  if (session.status === 'EXPIRED') {
    throw new ConflictError('This booking session has expired. Please start your booking again.')
  }

  const method = session.paymentMethod
  if (!method) {
    throw new UnprocessableError('Payment method is required.')
  }

  const settings = await getPaymentSettingsRecord()
  const enabled = (settings.enabledPaymentMethods ?? []) as PaymentMethod[]
  if (method !== 'ONLINE' && enabled.length > 0 && !enabled.includes(method)) {
    throw new UnprocessableError('This payment method is not currently accepted. Please choose another method.')
  }

  const isCash = method === 'CASH'

  const result = await prisma.$transaction(async (tx) => {
    const slot = await assertSessionBookable(
      session.barberId,
      session.serviceId,
      session.appointmentDate,
      session.appointmentTime,
      session.convertedAppointmentId ?? undefined,
      session.id,
      tx,
    )
    if (!slot) {
      throw new ConflictError(
        'This time slot is no longer available. Your session payment cannot be applied — please book again.',
      )
    }

    const customer = await findOrCreateCustomer(
      {
        fullName: session.customerName,
        phone: session.customerPhone,
        email: session.customerEmail,
      },
      tx,
    )

    const referenceCode = await generateReferenceCode(session.appointmentDate, tx)

    const appointment = await tx.appointment.create({
      data: {
        customerName: session.customerName,
        customerPhone: session.customerPhone,
        customerEmail: session.customerEmail,
        customerLocation: session.customerLocation ?? null,
        customerId: customer.id,
        serviceId: session.serviceId,
        barberId: session.barberId,
        appointmentDate: session.appointmentDate,
        appointmentTime: session.appointmentTime,
        totalAmount: Number(session.totalAmount),
        notes: session.notes,
        status: !isCash ? AppointmentStatusValue.PAYMENT_SUBMITTED : AppointmentStatusValue.PAYMENT_REQUIRED,
        referenceCode,
      },
    })

    await createEarningSnapshot(appointment.id, session.barberId, Number(session.totalAmount), tx)

    const payment = await tx.payment.create({
      data: {
        appointmentId: appointment.id,
        customerId: customer.id,
        amount: Number(session.totalAmount),
        paymentMethod: method,
        transactionReference: session.transactionReference ?? null,
        paymentDate: isCash ? null : new Date().toISOString().slice(0, 10),
        receiptUrl: session.receiptUrl,
        receiptPublicId: session.receiptPublicId,
        note: null,
        status: isCash ? 'UNPAID' : 'PENDING_VERIFICATION',
        accessToken: crypto.randomBytes(24).toString('hex'),
      },
    })

    await tx.checkoutSession.update({
      where: { id: session.id },
      data: { status: 'CONVERTED', convertedAppointmentId: appointment.id },
    })

    return { appointment, payment }
  })

  return {
    appointment: {
      id: result.appointment.id,
      referenceCode: result.appointment.referenceCode,
      status: result.appointment.status,
      customerName: result.appointment.customerName,
      appointmentDate: result.appointment.appointmentDate,
      appointmentTime: result.appointment.appointmentTime,
    },
    payment: {
      id: result.payment.id,
      accessToken: result.payment.accessToken,
      amount: Number(result.payment.amount),
      status: result.payment.status,
    },
    sessionToken,
  }
}

/** Marks a session EXPIRED (customer abandoned the checkout). */
export async function abandonCheckout(sessionToken: string): Promise<{ abandoned: boolean }> {
  const session = await prisma.checkoutSession.findUnique({ where: { sessionToken } })
  if (!session || session.status === 'CONVERTED') {
    return { abandoned: false }
  }
  await prisma.checkoutSession.update({
    where: { id: session.id },
    data: { status: 'EXPIRED' },
  })
  return { abandoned: true }
}

const PAYSTACK_BASE = 'https://api.paystack.co'

async function paystackRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) {
    throw new UnprocessableError('Online payment is not configured. Please contact the administrator.')
  }
  let response: Response
  try {
    response = await fetch(`${PAYSTACK_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new UnprocessableError('Unable to connect to the payment gateway. Please try again.')
  }
  const json = (await response.json().catch(() => null)) as
    | { status: boolean; message: string; data: T }
    | null
  if (!response.ok || !json?.status) {
    throw new UnprocessableError(
      json?.message ?? 'The payment gateway rejected this request. Please try again.',
    )
  }
  return json.data
}

/** Starts (or resumes) the Paystack checkout on this session. */
export async function initializeCheckoutPaystack(sessionToken: string): Promise<{
  authorizationUrl: string
  accessCode: string
  reference: string
}> {
  const session = await loadSessionWithRelations(sessionToken)
  if (session.status === 'CONVERTED') {
    throw new ConflictError('This booking has already been completed.')
  }
  if (session.status === 'EXPIRED') {
    throw new ConflictError('This booking session has expired. Please start your booking again.')
  }

  if (session.status === 'AWAITING_PAYMENT' && session.paystackReference) {
    const existing = await paystackRequest<{ authorization_url: string; access_code: string; reference: string }>(
      'POST',
      '/transaction/initialize',
      {
        email: session.customerEmail ?? `${session.customerPhone.replace(/\D/g, '')}@payments.sawabasalon.com`,
        amount: Math.round(Number(session.totalAmount) * 100),
        reference: session.paystackReference,
      },
    ).catch(async () => {
      return null
    })
    if (existing) {
      return { authorizationUrl: existing.authorization_url, accessCode: existing.access_code, reference: existing.reference }
    }
  }

  const reference = `SAWABA-CKT${session.id}-${Date.now()}`
  const init = await paystackRequest<{ authorization_url: string; access_code: string; reference: string }>(
    'POST',
    '/transaction/initialize',
    {
      email: session.customerEmail ?? `${session.customerPhone.replace(/\D/g, '')}@payments.sawabasalon.com`,
      amount: Math.round(Number(session.totalAmount) * 100),
      reference,
      metadata: { checkoutSessionId: session.id, sessionToken: session.sessionToken },
    },
  )

  await prisma.checkoutSession.update({
    where: { id: session.id },
    data: { status: 'AWAITING_PAYMENT', paystackReference: init.reference },
  })

  return {
    authorizationUrl: init.authorization_url,
    accessCode: init.access_code,
    reference: init.reference,
  }
}

/**
 * Re-verifies the charge directly with Paystack and creates Appointment + Payment.
 */
export async function verifyCheckoutPaystack(sessionToken: string, reference: string): Promise<FinalizeResult> {
  const session = await loadSessionWithRelations(sessionToken)

  if (session.status === 'CONVERTED') {
    const result = await finalizeResultForConverted(session)
    if (result) return result
    throw new ConflictError('This booking has already been completed.')
  }

  if (!session.paystackReference || reference !== session.paystackReference) {
    throw new UnprocessableError('This payment reference does not match this booking session.')
  }

  const txn = await paystackRequest<{ status: string; amount: number; id: number }>(
    'GET',
    `/transaction/verify/${encodeURIComponent(reference)}`,
  )

  if (txn.status !== 'success') {
    throw new UnprocessableError(
      `Paystack reports this payment as "${txn.status}". No booking has been created — please try again or choose another payment method.`,
    )
  }

  const expectedKobo = Math.round(Number(session.totalAmount) * 100)
  if (txn.amount !== expectedKobo) {
    throw new UnprocessableError(
      'The paid amount does not match the booking price. Please contact support.',
    )
  }

  const result = await finalizeCheckout(sessionToken)
  await prisma.payment.update({
    where: { id: result.payment.id },
    data: { providerRef: String(txn.id), paymentMethod: 'ONLINE' },
  })
  return result
}

async function finalizeResultForConverted(session: CheckoutSessionWithRelations): Promise<FinalizeResult | null> {
  if (!session.convertedAppointmentId) return null
  const existing = await prisma.appointment.findUnique({
    where: { id: session.convertedAppointmentId },
    include: { payment: true },
  })
  if (!existing) return null
  return {
    appointment: {
      id: existing.id,
      referenceCode: existing.referenceCode,
      status: existing.status,
      customerName: existing.customerName,
      appointmentDate: existing.appointmentDate,
      appointmentTime: existing.appointmentTime,
    },
    payment: {
      id: existing.payment?.id ?? 0,
      accessToken: existing.payment?.accessToken ?? '',
      amount: Number(existing.payment?.amount ?? existing.totalAmount),
      status: existing.payment?.status ?? 'UNPAID',
    },
    sessionToken: session.sessionToken,
  }
}

/** Webhook path: charge.success on a checkout session → verify + finalize. */
export async function handleCheckoutWebhook(payload: {
  event: string
  data?: {
    status?: string
    id?: number
    reference?: string
    metadata?: { sessionToken?: string; appointmentId?: number } | null
  }
}): Promise<boolean> {
  if (payload.event !== 'charge.success') return false
  const sessionToken = payload.data?.metadata?.sessionToken
  if (!sessionToken) return false

  const session = await prisma.checkoutSession.findUnique({ where: { sessionToken } })
  if (!session || session.status !== 'AWAITING_PAYMENT' || !session.paystackReference) return false

  await verifyCheckoutPaystack(sessionToken, session.paystackReference)
  return true
}

/** Public session view for the payment step. */
export async function getCheckoutSession(sessionToken: string): Promise<CheckoutSessionPublic> {
  return serializeSession(await loadSessionWithRelations(sessionToken))
}
