import { Op } from 'sequelize'
import { Appointment, Barber, Payment, Service } from '../models'
import { ConflictError, NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'
import { uploadImageToCloudinary, deleteImageByUrl } from '../utils/upload'
import type { PaymentSetting } from '../models/PaymentSetting'
import { getPaymentSettingsRecord, serializePaymentSetting } from './paymentSettingsService'
import { syncEarningForAppointment } from './commissionService'
import { AppointmentStatusValue, canTransition } from '../config/appointmentStatuses'
import type { AppointmentStatus, Paged, PaymentMethod, PaymentStatus } from '../types'
import type { SubmitPaymentInput, TrackPaymentInput } from '../validators/payment'

const appointmentInclude = [
  {
    model: Appointment,
    as: 'appointment',
    include: [
      { model: Service, as: 'service' },
      { model: Barber, as: 'barber' },
    ],
  },
]

export interface PaymentAppointment {
  id: number
  referenceCode: string | null
  customerName: string
  customerPhone: string
  customerEmail: string | null
  appointmentDate: string
  appointmentTime: string
  totalAmount: number
  status: AppointmentStatus
  service: { id: number; name: string; price: number; duration: number } | null
  barber: { id: number; name: string; image: string | null } | null
}

export interface PaymentPublic {
  id: number
  appointmentId: number
  amount: number
  paymentMethod: PaymentMethod | null
  transactionReference: string | null
  paymentDate: string | null
  receiptUrl: string | null
  note: string | null
  status: PaymentStatus
  rejectionReason: string | null
  verifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
  accessToken: string
  appointment?: PaymentAppointment
}

export interface PublicPaymentBundle {
  payment: PaymentPublic
  settings: ReturnType<typeof serializePaymentSetting>
}

/** Marks a payment PAID on provider/admin confirmation and advances the appointment. */
export async function applyProviderVerification(
  appointmentId: number,
  info: { provider: string; providerRef: string | null; adminId: number | null } | null,
): Promise<PublicPaymentBundle> {
  const payment = await Payment.findOne({ where: { appointmentId } })
  if (!payment) {
    throw new NotFoundError('Payment record not found for this appointment.')
  }

  if (payment.status !== 'PAID') {
    await payment.update({
      status: 'PAID',
      verifiedBy: info?.adminId ?? null,
      verifiedAt: new Date(),
      rejectionReason: null,
      ...(info?.providerRef ? { providerRef: info.providerRef } : {}),
    })
  }

  const appointment = await Appointment.findByPk(appointmentId)
  if (appointment && appointment.status !== AppointmentStatusValue.CANCELLED) {
    if (appointment.status !== AppointmentStatusValue.PAYMENT_VERIFIED) {
      await appointment.update({ status: AppointmentStatusValue.PAYMENT_VERIFIED })
    }
    // Auto-advance into service when valid; provider-confirmed payments may jump
    // straight from PAYMENT_REQUIRED because Paystack attested the money arrived.
    const canAutoAdvance =
      canTransition(appointment.status as AppointmentStatus, AppointmentStatusValue.READY_FOR_SERVICE) ||
      appointment.status === AppointmentStatusValue.PAYMENT_REQUIRED
    if (
      canAutoAdvance &&
      appointment.status !== AppointmentStatusValue.READY_FOR_SERVICE &&
      appointment.status !== AppointmentStatusValue.IN_PROGRESS &&
      appointment.status !== AppointmentStatusValue.COMPLETED
    ) {
      await appointment.update({ status: AppointmentStatusValue.READY_FOR_SERVICE })
    }
  }

  // Money is now confirmed — re-evaluate the commission ledger (#19). If the
  // appointment is already COMPLETED the earning flips to EARNED here; if the
  // appointment completes later, the status transition re-syncs it.
  await syncEarningForAppointment(appointmentId)

  return getPublicPaymentByAppointmentId(appointmentId)
}

async function getPublicPaymentByAppointmentId(appointmentId: number): Promise<PublicPaymentBundle> {
  const payment = await getPaymentByAppointmentId(appointmentId)
  const settings = await getPaymentSettingsRecord()
  return { payment: serializePayment(payment), settings: serializePaymentSetting(settings) }
}

/** Finds a payment by its public access token (the /pay/:token URL). */
export async function getPaymentByAccessToken(token: string): Promise<Payment> {
  const payment = await Payment.findOne({ where: { accessToken: token }, include: appointmentInclude })
  if (!payment) {
    throw new NotFoundError('Payment not found. Check the link and try again.')
  }
  return payment
}

function serializePayment(payment: Payment): PaymentPublic {
  const base: PaymentPublic = {
    id: payment.id,
    appointmentId: payment.appointmentId,
    amount: Number(payment.amount),
    paymentMethod: payment.paymentMethod,
    transactionReference: payment.transactionReference,
    paymentDate: payment.paymentDate,
    receiptUrl: payment.receiptUrl,
    note: payment.note,
    status: payment.status,
    rejectionReason: payment.rejectionReason,
    verifiedAt: payment.verifiedAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    accessToken: payment.accessToken,
  }

  const appointment = payment.appointment as
    | (Payment['appointment'] & {
        service?: {
          id: number
          name: string
          price: number
          duration: number
        }
        barber?: { id: number; name: string; image: string | null }
      })
    | undefined

  if (appointment) {
    base.appointment = {
      id: appointment.id,
      referenceCode: appointment.referenceCode,
      customerName: appointment.customerName,
      customerPhone: appointment.customerPhone,
      customerEmail: appointment.customerEmail,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      totalAmount: Number(appointment.totalAmount),
      status: appointment.status,
      service: appointment.service
        ? {
            id: appointment.service.id,
            name: appointment.service.name,
            price: Number(appointment.service.price),
            duration: appointment.service.duration,
          }
        : null,
      barber: appointment.barber
        ? { id: appointment.barber.id, name: appointment.barber.name, image: appointment.barber.image }
        : null,
    }
  }

  return base
}

async function getPaymentByAppointmentId(appointmentId: number): Promise<Payment> {
  const payment = await Payment.findOne({
    where: { appointmentId },
    include: appointmentInclude,
  })
  if (!payment) {
    throw new NotFoundError('Payment record not found for this appointment.')
  }
  return payment
}

export async function getPublicPayment(token: string): Promise<PublicPaymentBundle> {
  const payment = await Payment.findOne({ where: { accessToken: token }, include: appointmentInclude })
  if (!payment) {
    throw new NotFoundError('Payment not found. Check the link and try again.')
  }
  const settings = await getPaymentSettingsRecord()
  return { payment: serializePayment(payment), settings: serializePaymentSetting(settings) }
}

export async function submitPayment(
  token: string,
  input: SubmitPaymentInput,
  receiptBuffer: Buffer | null,
): Promise<PublicPaymentBundle> {
  const payment = await Payment.findOne({ where: { accessToken: token }, include: appointmentInclude })
  if (!payment) {
    throw new NotFoundError('Payment not found. Check the link and try again.')
  }

  const appointment = payment.appointment
  if (!appointment || appointment.status === AppointmentStatusValue.CANCELLED) {
    throw new UnprocessableError('This appointment has been cancelled and cannot accept a payment.')
  }
  if (payment.status === 'PAID') {
    throw new ConflictError('This appointment has already been paid and verified.')
  }
  if (payment.status === 'PENDING_VERIFICATION') {
    throw new ConflictError(
      'This payment has already been submitted and is under review. Please wait for our team to verify it.',
    )
  }

  const settings: PaymentSetting = await getPaymentSettingsRecord()

  const enabled = (settings.enabledPaymentMethods ?? []) as PaymentMethod[]
  if (enabled.length > 0 && !enabled.includes(input.paymentMethod)) {
    throw new UnprocessableError('This payment method is not currently accepted. Please choose another method.')
  }

  // Cash never produces a paper/electronic receipt — the admin verifies it
  // in person. Every other method honours the settings toggle.
  const requiresReceipt = settings.receiptRequired && input.paymentMethod !== 'CASH'
  if (requiresReceipt && !receiptBuffer) {
    throw new UnprocessableError('Please upload a payment receipt image.')
  }

  const expectedAmount = Number(appointment.totalAmount)
  if (settings.fullPaymentRequired && input.amountPaid < expectedAmount) {
    throw new UnprocessableError(
      `The amount paid (₦${input.amountPaid.toLocaleString()}) is less than the required amount (₦${expectedAmount.toLocaleString()}). Please pay the full amount.`,
    )
  }
  const minAmount = Number(settings.minAmount) || 0
  if (input.amountPaid < minAmount) {
    throw new UnprocessableError(
      `Payment amount does not meet the minimum of ₦${minAmount.toLocaleString()}.`,
    )
  }

  let receiptUrl = payment.receiptUrl
  let receiptPublicId = payment.receiptPublicId

  if (receiptBuffer) {
    const uploaded = await uploadImageToCloudinary(receiptBuffer, 'sawaba-receipts', 'image/jpeg')
    receiptUrl = uploaded.url
    receiptPublicId = uploaded.publicId
    if (payment.receiptPublicId && payment.receiptPublicId !== receiptPublicId) {
      try {
        await deleteImageByUrl(payment.receiptUrl ?? '')
      } catch {
        // best-effort cleanup of the previous receipt
      }
    }
  }

  await payment.update({
    paymentMethod: input.paymentMethod,
    amount: input.amountPaid,
    transactionReference: input.transactionReference || null,
    paymentDate: input.paymentDate,
    note: input.note ?? null,
    receiptUrl,
    receiptPublicId,
    status: 'PENDING_VERIFICATION',
    rejectionReason: null,
  })

  await appointment.update({ status: AppointmentStatusValue.PAYMENT_SUBMITTED })

  const fresh = await getPaymentByAppointmentId(appointment.id)
  return { payment: serializePayment(fresh), settings: serializePaymentSetting(settings) }
}

/**
 * Cash flow (customer side): the customer declares they will pay cash at the
 * salon. This only RECORDS the chosen method — the payment stays UNPAID until
 * an admin confirms the money was physically received. No receipt, no
 * provider, no appointment confirmation.
 */
export async function declareCashPayment(token: string): Promise<PublicPaymentBundle> {
  const payment = await Payment.findOne({ where: { accessToken: token }, include: appointmentInclude })
  if (!payment) {
    throw new NotFoundError('Payment not found. Check the link and try again.')
  }
  const appointment = payment.appointment
  if (!appointment || appointment.status === AppointmentStatusValue.CANCELLED) {
    throw new UnprocessableError('This appointment has been cancelled and cannot accept a payment.')
  }
  if (payment.status === 'PAID') {
    throw new ConflictError('This appointment has already been paid and verified.')
  }
  if (payment.status === 'PENDING_VERIFICATION') {
    throw new ConflictError('A payment is already under review for this appointment.')
  }

  const settings: PaymentSetting = await getPaymentSettingsRecord()
  const enabled = (settings.enabledPaymentMethods ?? []) as PaymentMethod[]
  if (enabled.length > 0 && !enabled.includes('CASH')) {
    throw new UnprocessableError('Cash payment is not currently accepted. Please choose another method.')
  }

  await payment.update({
    paymentMethod: 'CASH',
    amount: Number(appointment.totalAmount),
    status: 'UNPAID',
    rejectionReason: null,
  })

  const fresh = await getPaymentByAppointmentId(appointment.id)
  return { payment: serializePayment(fresh), settings: serializePaymentSetting(settings) }
}

export async function trackPayment(input: TrackPaymentInput): Promise<PublicPaymentBundle> {
  const normalize = (phone: string): string => phone.replace(/\D/g, '').slice(-10)

  const identifier = input.appointmentId.trim().toUpperCase()
  const appointment = /^\d+$/.test(identifier)
    ? await Appointment.findByPk(Number(identifier))
    : await Appointment.findOne({ where: { referenceCode: identifier } })

  if (!appointment || normalize(appointment.customerPhone) !== normalize(input.phone)) {
    throw new NotFoundError('No appointment matches those details. Please check and try again.')
  }

  const payment = await getPaymentByAppointmentId(appointment.id)
  const settings = await getPaymentSettingsRecord()
  return { payment: serializePayment(payment), settings: serializePaymentSetting(settings) }
}

export interface ListPaymentsQuery {
  status?: PaymentStatus
  method?: PaymentMethod
  from?: string
  to?: string
  search?: string
  page?: number
  perPage?: number
}

export async function listPayments(query: ListPaymentsQuery): Promise<Paged<PaymentPublic>> {
  const { page, perPage, offset, limit } = getPagination(query as Record<string, unknown>)

  const where: Record<string, unknown> = {}
  if (query.status) where.status = query.status
  if (query.method) where.paymentMethod = query.method
  if (query.from || query.to) {
    where.paymentDate = {
      ...(query.from ? { [Op.gte]: query.from } : {}),
      ...(query.to ? { [Op.lte]: query.to } : {}),
    }
  }

  const search = query.search?.trim()
  let appointmentWhere: Record<string, unknown> | undefined
  if (search) {
    const orClauses: Array<Record<string, unknown>> = [
      { referenceCode: { [Op.like]: `%${search}%` } },
      { customerName: { [Op.like]: `%${search}%` } },
      { customerPhone: { [Op.like]: `%${search}%` } },
    ]
    if (/^\d+$/.test(search)) {
      orClauses.push({ id: Number(search) })
    }
    appointmentWhere = { [Op.or]: orClauses }
  }

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [
      {
        model: Appointment,
        as: 'appointment',
        where: appointmentWhere,
        required: Boolean(appointmentWhere),
        include: [
          { model: Service, as: 'service' },
          { model: Barber, as: 'barber' },
        ],
      },
    ],
    distinct: true,
    order: [['createdAt', 'DESC']],
    offset,
    limit,
  })

  return {
    items: rows.map(serializePayment),
    total: count,
    page,
    perPage,
  }
}

export async function getPaymentById(id: number): Promise<PaymentPublic> {
  const payment = await Payment.findByPk(id, { include: appointmentInclude })
  if (!payment) {
    throw new NotFoundError('Payment not found.')
  }
  return serializePayment(payment)
}

export async function verifyPayment(id: number, adminId: number): Promise<PaymentPublic> {
  const payment = await Payment.findByPk(id, { include: appointmentInclude })
  if (!payment) {
    throw new NotFoundError('Payment not found.')
  }
  if (payment.status === 'PAID') {
    throw new ConflictError('This payment is already verified.')
  }
  if (payment.status !== 'PENDING_VERIFICATION') {
    throw new UnprocessableError('Only submitted payments can be verified.')
  }
  if (!payment.receiptUrl && payment.paymentMethod !== 'CASH') {
    // Receipt rule applies ONLY to receipt-based methods (transfer/OPay).
    // Cash is confirmed in person with "Mark Cash as Paid" — never here.
    const settings = await getPaymentSettingsRecord()
    if (settings.receiptRequired) {
      throw new UnprocessableError(
        'This payment has no uploaded receipt. Ask the customer to submit it, or reject the payment with a reason so they can retry.',
      )
    }
  }

  await payment.update({
    status: 'PAID',
    verifiedBy: adminId,
    verifiedAt: new Date(),
  })

  // Delegate to the shared verification path (same logic as online/webhook verification).
  await applyProviderVerification(payment.appointmentId, {
    provider: 'manual',
    providerRef: null,
    adminId,
  })
  return getPaymentById(id)
}

/**
 * Cash flow: the customer pays physically at the salon. No receipt exists —
 * the admin confirms receipt of the money in person and the backend records
 * the audit trail (paid at, verified by, note).
 */
export async function confirmCashPayment(
  id: number,
  adminId: number,
  note: string | null,
): Promise<PaymentPublic> {
  const payment = await Payment.findByPk(id, { include: appointmentInclude })
  if (!payment) {
    throw new NotFoundError('Payment not found.')
  }
  if (payment.paymentMethod !== 'CASH') {
    throw new UnprocessableError('This payment is not a cash payment.')
  }
  if (payment.status === 'PAID') {
    throw new ConflictError('This cash payment is already confirmed.')
  }
  if (payment.status === 'CANCELLED' || payment.status === 'REFUNDED') {
    throw new UnprocessableError('This payment can no longer be confirmed.')
  }

  const appointment = payment.appointment
  if (!appointment || appointment.status === AppointmentStatusValue.CANCELLED) {
    throw new UnprocessableError('The appointment for this payment has been cancelled.')
  }

  await payment.update({
    status: 'PAID',
    paymentDate: new Date().toISOString().slice(0, 10),
    verifiedBy: adminId,
    verifiedAt: new Date(),
    note: note ?? payment.note ?? 'Cash received at salon.',
    rejectionReason: null,
  })

  await applyProviderVerification(payment.appointmentId, {
    provider: 'cash-at-salon',
    providerRef: null,
    adminId,
  })
  return getPaymentById(id)
}

export async function rejectPayment(
  id: number,
  reason: string,
  adminId: number,
): Promise<PaymentPublic> {
  const payment = await Payment.findByPk(id, { include: appointmentInclude })
  if (!payment) {
    throw new NotFoundError('Payment not found.')
  }
  if (payment.status === 'PAID') {
    throw new ConflictError('This payment is already verified and cannot be rejected.')
  }

  await payment.update({
    status: 'REJECTED',
    rejectionReason: reason,
    verifiedBy: adminId,
    verifiedAt: null,
  })

  const appointment = payment.appointment
  if (appointment && appointment.status !== AppointmentStatusValue.CANCELLED) {
    await appointment.update({ status: AppointmentStatusValue.PAYMENT_REJECTED })
  }

  return getPaymentById(id)
}

export async function markPaymentCancelled(appointmentId: number): Promise<void> {
  const payment = await Payment.findOne({ where: { appointmentId } })
  if (payment && payment.status !== 'PAID') {
    await payment.update({ status: 'CANCELLED' })
  }
}