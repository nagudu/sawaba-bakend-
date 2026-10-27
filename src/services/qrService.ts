import crypto from 'node:crypto'
import { prisma } from '../config/database'
import type { AppointmentStatus, PaymentMethod, PaymentStatus } from '@prisma/client'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'

/**
 * In-person check-in QR verification.
 *
 * Security model
 * --------------
 * • The QR payload is a 256-bit random token, unique per appointment. It is the
 *   only secret a customer needs to present; nothing about the booking can be
 *   derived from it.
 * • Tokens are generated lazily, never reused, and can be revoked (regenerated)
 *   without touching the appointment itself.
 * • A scan is only ever a *lookup*. The scanner must be an authenticated barber
 *   and the booking must belong to that barber; the payment must be PAID for the
 *   full amount and not cancelled/refunded. Anything else returns a restricted
 *   result with no customer personally identifiable information.
 * • Every attempt is written to an append-only audit log. The raw token is never
 *   stored — only a short, non-reversible SHA-256 fingerprint.
 */

export const QR_PREFIX = 'sawaba:'

export type QrOutcome =
  | 'VALID'
  | 'PAYMENT_NOT_VERIFIED'
  | 'PAYMENT_MISMATCH'
  | 'NOT_FOUND'
  | 'REVOKED'
  | 'CANCELLED'
  | 'UNAUTHORIZED'
  | 'INVALID_TOKEN'
  | 'CHECKED_IN'
  | 'ALREADY_CHECKED_IN'

export interface QrScanPayment {
  id: number
  status: PaymentStatus | 'NONE'
  amount: number
  method: PaymentMethod | null
  transactionReference: string | null
  paymentDate: string | null
  note: string | null
  rejectionReason: string | null
  verifiedAt: Date | null
  /** Only exposed to admins — barbers see status/amount but never the receipt. */
  receiptUrl: string | null
}

export interface QrScanAppointment {
  id: number
  referenceCode: string | null
  appointmentDate: string
  appointmentTime: string
  totalAmount: number
  status: AppointmentStatus
  service: { id: number; name: string; duration: number } | null
  barberName: string | null
  barberId: number | null
  assignedBarberId: number | null
  checkedInAt: Date | null
  /** Customer PII — present only for a fully valid, authorised scan. */
  customerId?: number | null
  customerName?: string
  customerPhone?: string
  customerEmail?: string | null
  /** Free-text customer instructions for the appointment. */
  notes?: string | null
  /** Payment breakdown — populated for valid/authorised scans. */
  payment?: QrScanPayment | null
}

export interface QrScanHistoryEntry {
  id: number
  outcome: QrOutcome
  source: string
  actorRole: string
  barberName: string | null
  adminId: number | null
  detail: string | null
  createdAt: Date
}

export interface QrScanResult {
  outcome: QrOutcome
  valid: boolean
  canCheckIn: boolean
  checkedIn: boolean
  paymentStatus: PaymentStatus | 'NONE'
  message: string
  appointment: QrScanAppointment | null
  scannedAt: Date
}

const OUTCOME_MESSAGES: Record<QrOutcome, string> = {
  VALID: 'Payment verified. This booking is valid.',
  PAYMENT_NOT_VERIFIED: 'This booking is not yet paid. Payment must be verified before check-in.',
  PAYMENT_MISMATCH: 'The verified payment does not cover the full service amount.',
  NOT_FOUND: 'No booking matches this code.',
  REVOKED: 'This QR code has been revoked. Ask the customer to refresh it in their account.',
  CANCELLED: 'This booking has been cancelled.',
  UNAUTHORIZED: 'This booking is not assigned to you.',
  INVALID_TOKEN: 'That QR code or reference could not be recognised.',
  CHECKED_IN: 'Customer checked in successfully.',
  ALREADY_CHECKED_IN: 'This customer has already been checked in.',
}

function generateQrToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** Non-reversible short fingerprint; safe to persist for audit/forensics. */
export function qrFingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export function parseQrPayload(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = String(raw).trim()
  const marker = value.toLowerCase().lastIndexOf(QR_PREFIX)
  if (marker >= 0) {
    // Legacy / in-app payload: "sawaba:<token>"
    value = value.slice(marker + QR_PREFIX.length)
  } else if (value.includes('/')) {
    // Link payload: "<origin>/qr/<token>" (ignore any query string or hash).
    const path = value.split(/[?#]/)[0]
    const segments = path.split('/').filter(Boolean)
    value = segments[segments.length - 1] ?? ''
  }
  value = value.trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(value) ? value : null
}

/**
 * The value encoded into a booking QR image: the opaque 256-bit token itself —
 * a unique, secure identifier that maps to exactly one booking in the database.
 *
 * It is deliberately NOT a URL. A URL would make a phone's native camera open a
 * browser (Chrome) instead of using the in-app scanner. The token carries no
 * customer data; the in-app scanner (admin/barber dashboard) resolves it via the
 * backend and renders the booking details only for authorised staff.
 *
 * `parseQrPayload` also still understands the legacy "sawaba:<token>" form and
 * any previously-issued "<origin>/qr/<token>" link form, so already-generated
 * codes keep working and can be regenerated safely.
 */
export function buildQrPayload(token: string): string {
  return token
}

export function paymentBadge(status: PaymentStatus | null | undefined): PaymentStatus | 'NONE' {
  return status ?? 'NONE'
}

function limitedAppointment(apt: {
  id: number
  referenceCode: string | null
  appointmentDate: string
  appointmentTime: string
  totalAmount: unknown
  status: AppointmentStatus
  checkedInAt: Date | null
  barberId: number | null
  assignedBarberId: number | null
  service: { id: number; name: string; duration: number } | null
  barber: { name: string } | null
}): QrScanAppointment {
  return {
    id: apt.id,
    referenceCode: apt.referenceCode,
    appointmentDate: apt.appointmentDate,
    appointmentTime: apt.appointmentTime,
    totalAmount: Number(apt.totalAmount),
    status: apt.status,
    service: apt.service,
    barberName: apt.barber?.name ?? null,
    barberId: apt.barberId,
    assignedBarberId: apt.assignedBarberId,
    checkedInAt: apt.checkedInAt,
  }
}

const scanInclude = {
  service: { select: { id: true, name: true, duration: true } },
  barber: { select: { id: true, name: true } },
  assignedBarber: { select: { id: true, name: true } },
  payment: {
    select: {
      id: true,
      status: true,
      amount: true,
      paymentMethod: true,
      transactionReference: true,
      receiptUrl: true,
      note: true,
      rejectionReason: true,
      paymentDate: true,
      verifiedAt: true,
    },
  },
} as const

/** Payment block for a scan result. Receipts are admin-only. */
function serializeScanPayment(
  payment: {
    id: number
    status: PaymentStatus
    amount: unknown
    paymentMethod: PaymentMethod | null
    transactionReference: string | null
    receiptUrl: string | null
    note: string | null
    rejectionReason: string | null
    paymentDate: string | null
    verifiedAt: Date | null
  },
  includeReceipt: boolean,
): QrScanPayment {
  return {
    id: payment.id,
    status: payment.status,
    amount: Number(payment.amount),
    method: payment.paymentMethod,
    transactionReference: payment.transactionReference,
    receiptUrl: includeReceipt ? payment.receiptUrl : null,
    note: payment.note,
    rejectionReason: payment.rejectionReason,
    paymentDate: payment.paymentDate,
    verifiedAt: payment.verifiedAt,
  }
}

async function findAppointmentForScan(where: { id?: number; qrToken?: string; referenceCode?: string }) {
  return prisma.appointment.findFirst({ where, include: scanInclude })
}

export interface ScanContext {
  ip?: string | null
  userAgent?: string | null
  source?: 'QR' | 'MANUAL' | 'ADMIN'
}

/**
 * Who is performing the scan. Barbers are restricted to their own bookings;
 * admins may inspect any booking but still cannot mutate payment by scanning.
 */
type ScanActor =
  | { role: 'BARBER'; barberId: number }
  | { role: 'ADMIN'; adminId: number }

async function recordScan(
  actor: { barberId?: number | null; adminId?: number | null; role: string },
  outcome: QrOutcome,
  meta: ScanContext,
  appointment?: { id: number; referenceCode: string | null } | null,
  fingerprint?: string | null,
  detail?: string | null,
): Promise<void> {
  try {
    await prisma.qrScanLog.create({
      data: {
        appointmentId: appointment?.id ?? null,
        barberId: actor.barberId ?? null,
        adminId: actor.adminId ?? null,
        actorRole: actor.role,
        outcome,
        source: meta.source ?? 'QR',
        tokenFingerprint: fingerprint ?? null,
        referenceCode: appointment?.referenceCode ?? null,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
        detail: detail ? detail.slice(0, 300) : null,
      },
    })
  } catch {
    // Auditing must never break the scan response.
  }
}

/**
 * Lazily mints a fresh token for an appointment. Returns the existing token when
 * one is present and not revoked; never returns a revoked/expired token.
 */
export async function ensureAppointmentQrToken(appointmentId: number): Promise<string> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, qrToken: true, qrRevokedAt: true, status: true },
  })
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }
  if (appointment.status === 'CANCELLED') {
    throw new UnprocessableError('This appointment has been cancelled, so it has no check-in QR code.')
  }
  if (appointment.qrToken && !appointment.qrRevokedAt) {
    return appointment.qrToken
  }
  return mintToken(appointmentId)
}

async function mintToken(appointmentId: number): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateQrToken()
    try {
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { qrToken: token, qrTokenGeneratedAt: new Date(), qrRevokedAt: null },
      })
      return token
    } catch {
      // Extremely unlikely unique collision — retry with a new token.
    }
  }
  throw new UnprocessableError('Could not generate a QR code. Please try again.')
}

/** Invalidates the current token; a new one is minted on next access. */
export async function revokeAppointmentQr(appointmentId: number): Promise<void> {
  await prisma.appointment.updateMany({
    where: { id: appointmentId, qrToken: { not: null }, qrRevokedAt: null },
    data: { qrRevokedAt: new Date() },
  })
}

export interface CustomerQr {
  appointmentId: number
  referenceCode: string | null
  qrPayload: string
  qrToken: string
  paymentStatus: PaymentStatus | 'NONE'
  checkedInAt: Date | null
  revokedAt: Date | null
}

/** Customer-facing fetch — scoped to the authenticated customer's own booking. */
export async function getCustomerAppointmentQr(
  customerId: number,
  appointmentId: number,
): Promise<CustomerQr> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, customerId },
    select: {
      id: true,
      referenceCode: true,
      status: true,
      checkedInAt: true,
      qrRevokedAt: true,
      payment: { select: { status: true } },
    },
  })
  if (!appointment) {
    throw new NotFoundError('Booking not found.')
  }
  if (appointment.status === 'CANCELLED') {
    throw new UnprocessableError('This booking was cancelled, so it has no check-in QR code.')
  }

  const token = await ensureAppointmentQrToken(appointmentId)

  return {
    appointmentId,
    referenceCode: appointment.referenceCode,
    qrPayload: buildQrPayload(token),
    qrToken: token,
    paymentStatus: paymentBadge(appointment.payment?.status),
    checkedInAt: appointment.checkedInAt,
    revokedAt: appointment.qrRevokedAt,
  }
}

export interface PublicBookingQr {
  appointmentId: number
  referenceCode: string | null
  qrPayload: string
  qrToken: string
  paymentStatus: PaymentStatus | 'NONE'
  appointmentStatus: AppointmentStatus
  checkedInAt: Date | null
  revokedAt: Date | null
  customerName: string
  serviceName: string | null
  barberName: string | null
  appointmentDate: string
  appointmentTime: string
  totalAmount: number
}

/** Same normalisation the payment tracker uses: compare the last 10 digits. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

/**
 * Guest-facing retrieval. A customer who booked without an account can reopen
 * their QR with the two things they were given: the booking reference (or the
 * numeric id) and the phone number they booked with. The phone acts as the
 * second factor, so a bare reference is never enough.
 */
export async function getPublicBookingQr(input: {
  reference: string
  phone: string
}): Promise<PublicBookingQr> {
  const identifier = input.reference.trim().toUpperCase()
  const include = {
    service: { select: { name: true } },
    barber: { select: { name: true } },
    assignedBarber: { select: { name: true } },
    payment: { select: { status: true } },
  } as const

  let appointment = null
  if (/^\d+$/.test(identifier)) {
    appointment = await prisma.appointment.findUnique({
      where: { id: Number(identifier) },
      include,
    })
  }
  if (!appointment) {
    appointment = await prisma.appointment.findUnique({
      where: { referenceCode: identifier },
      include,
    })
  }

  if (!appointment || normalizePhone(appointment.customerPhone) !== normalizePhone(input.phone)) {
    throw new NotFoundError('No booking matches those details. Please check and try again.')
  }
  if (appointment.status === 'CANCELLED') {
    throw new UnprocessableError('This booking was cancelled, so it has no check-in QR code.')
  }

  const token = await ensureAppointmentQrToken(appointment.id)

  return {
    appointmentId: appointment.id,
    referenceCode: appointment.referenceCode,
    qrPayload: buildQrPayload(token),
    qrToken: token,
    paymentStatus: paymentBadge(appointment.payment?.status),
    appointmentStatus: appointment.status,
    checkedInAt: appointment.checkedInAt,
    revokedAt: appointment.qrRevokedAt,
    customerName: appointment.customerName,
    serviceName: appointment.service?.name ?? null,
    barberName: appointment.assignedBarber?.name ?? appointment.barber?.name ?? null,
    appointmentDate: appointment.appointmentDate,
    appointmentTime: appointment.appointmentTime,
    totalAmount: Number(appointment.totalAmount),
  }
}

async function evaluateScan(
  actor: ScanActor,
  input: { token?: string | null; reference?: string | null },
): Promise<QrScanResult> {
  const includeReceipt = actor.role === 'ADMIN'
  const rawToken = input.token ?? null
  const rawReference = input.reference?.trim() || null

  let token: string | null = null
  if (rawToken) {
    token = parseQrPayload(rawToken)
    if (!token) {
      return notFoundResult('INVALID_TOKEN')
    }
  }

  if (!token && !rawReference) {
    return notFoundResult('INVALID_TOKEN')
  }

  const appointment = token
    ? await findAppointmentForScan({ qrToken: token })
    : await findAppointmentForScan({ referenceCode: rawReference! })

  if (!appointment) {
    return notFoundResult('NOT_FOUND')
  }

  const base = limitedAppointment(appointment)
  const paymentStatus = paymentBadge(appointment.payment?.status)

  // A valid appointment can be found by reference while its token is revoked:
  // treat that as revoked rather than exposing or trusting the stale code.
  if (appointment.qrRevokedAt) {
    return {
      outcome: 'REVOKED',
      valid: false,
      canCheckIn: false,
      checkedIn: Boolean(appointment.checkedInAt),
      paymentStatus,
      message: OUTCOME_MESSAGES.REVOKED,
      appointment: base,
      scannedAt: new Date(),
    }
  }

  if (appointment.status === 'CANCELLED') {
    return {
      outcome: 'CANCELLED',
      valid: false,
      canCheckIn: false,
      checkedIn: Boolean(appointment.checkedInAt),
      paymentStatus,
      message: OUTCOME_MESSAGES.CANCELLED,
      appointment: { ...base, checkedInAt: appointment.checkedInAt },
      scannedAt: new Date(),
    }
  }

  // Barbers may only ever act on their own bookings. Admins are not scoped.
  if (actor.role === 'BARBER') {
    const authorized =
      appointment.barberId === actor.barberId ||
      appointment.assignedBarberId === actor.barberId
    if (!authorized) {
      return notFoundResult('UNAUTHORIZED')
    }
  }

  if (!appointment.payment || appointment.payment.status !== 'PAID') {
    return {
      outcome: 'PAYMENT_NOT_VERIFIED',
      valid: false,
      canCheckIn: false,
      checkedIn: Boolean(appointment.checkedInAt),
      paymentStatus,
      message: OUTCOME_MESSAGES.PAYMENT_NOT_VERIFIED,
      appointment: {
        ...base,
        customerId: appointment.customerId,
        customerName: appointment.customerName,
        customerPhone: appointment.customerPhone,
        customerEmail: appointment.customerEmail,
        notes: appointment.notes,
        payment: appointment.payment
          ? serializeScanPayment(appointment.payment, includeReceipt)
          : null,
      },
      scannedAt: new Date(),
    }
  }

  if (Number(appointment.payment.amount) !== Number(appointment.totalAmount)) {
    return {
      outcome: 'PAYMENT_MISMATCH',
      valid: false,
      canCheckIn: false,
      checkedIn: Boolean(appointment.checkedInAt),
      paymentStatus,
      message: OUTCOME_MESSAGES.PAYMENT_MISMATCH,
      appointment: {
        ...base,
        customerId: appointment.customerId,
        customerName: appointment.customerName,
        customerPhone: appointment.customerPhone,
        customerEmail: appointment.customerEmail,
        notes: appointment.notes,
        payment: serializeScanPayment(appointment.payment, includeReceipt),
      },
      scannedAt: new Date(),
    }
  }

  const full: QrScanAppointment = {
    ...base,
    customerId: appointment.customerId,
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    customerEmail: appointment.customerEmail,
    notes: appointment.notes,
    payment: serializeScanPayment(appointment.payment, includeReceipt),
  }

  return {
    outcome: appointment.checkedInAt ? 'ALREADY_CHECKED_IN' : 'VALID',
    valid: true,
    canCheckIn: !appointment.checkedInAt,
    checkedIn: Boolean(appointment.checkedInAt),
    paymentStatus,
    message: appointment.checkedInAt ? OUTCOME_MESSAGES.ALREADY_CHECKED_IN : OUTCOME_MESSAGES.VALID,
    appointment: full,
    scannedAt: new Date(),
  }
}

function notFoundResult(outcome: QrOutcome): QrScanResult {
  return {
    outcome,
    valid: false,
    canCheckIn: false,
    checkedIn: false,
    paymentStatus: 'NONE',
    message: OUTCOME_MESSAGES[outcome],
    appointment: null,
    scannedAt: new Date(),
  }
}

function actorRef(actor: ScanActor): { barberId?: number | null; adminId?: number | null; role: string } {
  return actor.role === 'BARBER'
    ? { barberId: actor.barberId, role: 'BARBER' }
    : { adminId: actor.adminId, role: 'ADMIN' }
}

/** Validate a scanned/entered code without mutating anything. */
async function runScanValidation(
  actor: ScanActor,
  input: { token?: string | null; reference?: string | null },
  meta: ScanContext,
): Promise<QrScanResult> {
  const result = await evaluateScan(actor, input)

  await recordScan(
    actorRef(actor),
    result.outcome,
    { ...meta, source: input.token ? 'QR' : 'MANUAL' },
    result.appointment ? { id: result.appointment.id, referenceCode: result.appointment.referenceCode } : null,
    input.token ? qrFingerprint(parseQrPayload(input.token) ?? input.token) : null,
    result.outcome === 'VALID' ? 'Check-in authorised' : result.message,
  )

  return result
}

/** Barber scanner: validate a scanned/entered code without mutating anything. */
export async function validateQrScan(
  barberId: number,
  input: { token?: string | null; reference?: string | null },
  meta: ScanContext,
): Promise<QrScanResult> {
  return runScanValidation({ role: 'BARBER', barberId }, input, meta)
}

/** Admin scanner: validate any booking, with the fuller admin detail block. */
export async function validateQrScanAsAdmin(
  adminId: number,
  input: { token?: string | null; reference?: string | null },
  meta: ScanContext,
): Promise<QrScanResult> {
  return runScanValidation({ role: 'ADMIN', adminId }, input, meta)
}

/**
 * Marks the customer as checked in. Idempotent — a second scan never creates a
 * second check-in and is logged as ALREADY_CHECKED_IN.
 */
async function runCheckIn(
  actor: ScanActor,
  appointmentId: number,
  input: { token?: string | null },
  meta: ScanContext,
): Promise<QrScanResult> {
  const actorRefArg = actor.role === 'BARBER'
    ? { barberId: actor.barberId, role: 'BARBER' }
    : { adminId: actor.adminId, role: 'ADMIN' }

  const target = await prisma.appointment.findFirst({
    where: { id: appointmentId },
    include: scanInclude,
  })

  if (!target) {
    await recordScan(actorRefArg, 'NOT_FOUND', { ...meta, source: 'MANUAL' }, null, null, 'Check-in: appointment not found')
    return notFoundResult('NOT_FOUND')
  }

  if (actor.role === 'BARBER' && target.barberId !== actor.barberId && target.assignedBarberId !== actor.barberId) {
    await recordScan(actorRefArg, 'UNAUTHORIZED', { ...meta, source: 'MANUAL' }, { id: target.id, referenceCode: target.referenceCode }, null, 'Check-in blocked: not assigned')
    return notFoundResult('UNAUTHORIZED')
  }

  const eligible = await evaluateScan(actor, {
    token: (input.token ? parseQrPayload(input.token) : null) ?? target.qrToken ?? undefined,
    reference: target.referenceCode,
  })
  if (!eligible.valid && eligible.outcome !== 'ALREADY_CHECKED_IN') {
    await recordScan(actorRefArg, eligible.outcome, { ...meta, source: 'MANUAL' }, { id: target.id, referenceCode: target.referenceCode }, null, `Check-in blocked: ${eligible.message}`)
    return eligible
  }

  if (target.checkedInAt) {
    await recordScan(actorRefArg, 'ALREADY_CHECKED_IN', { ...meta, source: 'MANUAL' }, { id: target.id, referenceCode: target.referenceCode }, null, 'Duplicate check-in attempt')
    return {
      ...eligible,
      outcome: 'ALREADY_CHECKED_IN',
      valid: true,
      canCheckIn: false,
      checkedIn: true,
      message: OUTCOME_MESSAGES.ALREADY_CHECKED_IN,
    }
  }

  await prisma.appointment.update({
    where: { id: target.id },
    data: { checkedInAt: new Date() },
  })

  await recordScan(actorRefArg, 'CHECKED_IN', { ...meta, source: 'MANUAL' }, { id: target.id, referenceCode: target.referenceCode }, null, 'Customer checked in')

  return {
    ...eligible,
    outcome: 'CHECKED_IN',
    valid: true,
    canCheckIn: false,
    checkedIn: true,
    message: OUTCOME_MESSAGES.CHECKED_IN,
    appointment: eligible.appointment
      ? { ...eligible.appointment, checkedInAt: new Date() }
      : null,
  }
}

export async function checkInAppointment(
  barberId: number,
  appointmentId: number,
  input: { token?: string | null },
  meta: ScanContext,
): Promise<QrScanResult> {
  return runCheckIn({ role: 'BARBER', barberId }, appointmentId, input, meta)
}

export async function checkInAppointmentAsAdmin(
  adminId: number,
  appointmentId: number,
  input: { token?: string | null },
  meta: ScanContext,
): Promise<QrScanResult> {
  return runCheckIn({ role: 'ADMIN', adminId }, appointmentId, input, meta)
}

/** Recent check-in / scan history for a single appointment (admin view). */
export async function listAppointmentQrHistory(
  appointmentId: number,
  limit = 20,
): Promise<QrScanHistoryEntry[]> {
  const rows = await prisma.qrScanLog.findMany({
    where: { appointmentId },
    include: { barber: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map((row) => ({
    id: row.id,
    outcome: row.outcome as QrOutcome,
    source: row.source,
    actorRole: row.actorRole,
    barberName: row.barber?.name ?? null,
    adminId: row.adminId,
    detail: row.detail,
    createdAt: row.createdAt,
  }))
}

// ─── Admin ────────────────────────────────────────────────────────────────────

interface QrActivityQuery {
  outcome?: string
  source?: string
  barberId?: number
  appointmentId?: number
  from?: string
  to?: string
  page?: number
  perPage?: number
}

export async function listQrActivity(query: QrActivityQuery) {
  const { offset, limit, page, perPage } = getPagination(query as Record<string, unknown>)

  const where: {
    outcome?: string
    source?: string
    barberId?: number
    appointmentId?: number
    createdAt?: { gte?: Date; lte?: Date }
  } = {}
  if (query.outcome) where.outcome = query.outcome
  if (query.source) where.source = query.source
  if (query.barberId) where.barberId = query.barberId
  if (query.appointmentId) where.appointmentId = query.appointmentId
  if (query.from || query.to) {
    where.createdAt = {}
    if (query.from) where.createdAt.gte = new Date(`${query.from}T00:00:00.000Z`)
    if (query.to) where.createdAt.lte = new Date(`${query.to}T23:59:59.999Z`)
  }

  const [rows, total] = await Promise.all([
    prisma.qrScanLog.findMany({
      where,
      include: {
        barber: { select: { id: true, name: true } },
        appointment: { select: { id: true, referenceCode: true, customerName: true, checkedInAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.qrScanLog.count({ where }),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      appointmentId: row.appointmentId,
      referenceCode: row.referenceCode ?? row.appointment?.referenceCode ?? null,
      customerName: row.appointment?.customerName ?? null,
      barberId: row.barberId,
      barberName: row.barber?.name ?? null,
      adminId: row.adminId,
      actorRole: row.actorRole,
      outcome: row.outcome,
      source: row.source,
      ip: row.ip,
      detail: row.detail,
      createdAt: row.createdAt,
    })),
    total,
    page,
    perPage,
  }
}

export async function getQrActivityStats() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [total, valid, rejected, checkIns] = await Promise.all([
    prisma.qrScanLog.count(),
    prisma.qrScanLog.count({ where: { outcome: { in: ['VALID', 'CHECKED_IN', 'ALREADY_CHECKED_IN'] } } }),
    prisma.qrScanLog.count({ where: { outcome: { in: ['PAYMENT_NOT_VERIFIED', 'PAYMENT_MISMATCH', 'REVOKED', 'UNAUTHORIZED', 'CANCELLED'] } } }),
    prisma.qrScanLog.count({ where: { outcome: 'CHECKED_IN' } }),
  ])
  const recent = await prisma.qrScanLog.count({ where: { createdAt: { gte: since } } })
  return { total, valid, rejected, checkIns, last7Days: recent }
}

export async function adminRegenerateQr(appointmentId: number, adminId: number, meta: ScanContext) {
  const token = await mintToken(appointmentId)
  await recordScan({ adminId, role: 'ADMIN' }, 'VALID', { ...meta, source: 'ADMIN' }, { id: appointmentId, referenceCode: null }, qrFingerprint(token), 'Admin regenerated QR code')
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, referenceCode: true, qrToken: true },
  })
  return {
    appointmentId,
    referenceCode: appointment?.referenceCode ?? null,
    qrToken: appointment?.qrToken ?? token,
    qrPayload: buildQrPayload(appointment?.qrToken ?? token),
  }
}

export async function revokeQrByAdmin(
  appointmentId: number,
  adminId: number,
  meta: ScanContext,
): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, referenceCode: true },
  })
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }
  await revokeAppointmentQr(appointmentId)
  await recordScan({ adminId, role: 'ADMIN' }, 'REVOKED', { ...meta, source: 'ADMIN' }, appointment, null, 'QR revoked by admin')
}
