import { prisma } from '../config/database'
import type { Prisma, BarberType, CommissionType, EarningStatus } from '@prisma/client'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'
import { AppointmentStatusValue } from '../config/appointmentStatuses'
import type { EarningsQuery } from '../validators/barberEarning'
import type { Paged } from '../types'

/**
 * Barber commission engine.
 *
 * SECURITY INVARIANT: commission amounts are ALWAYS computed here, on the
 * backend, from the barber's stored config — never from client input. The
 * snapshot on each earning row freezes the terms at booking time so later
 * config changes never rewrite history (requirement #9).
 *
 * Business rule (#19): commission only becomes EARNED when the actual money
 * condition is satisfied — payment PAID and appointment COMPLETED. Cancelled
 * appointments are CANCELLED, never EARNED.
 */

export interface CommissionBreakdown {
  barberType: BarberType
  commissionType: CommissionType
  commissionRate: number
  serviceAmount: number
  commissionAmount: number
  studioAmount: number
}

/** Pure calculation — PERCENTAGE of service amount, or FIXED naira (never above the service amount). */
export function calculateCommission(
  barber: { barberType?: BarberType | null; commissionType?: CommissionType | null; commissionValue?: number | Prisma.Decimal | null },
  serviceAmount: number,
): CommissionBreakdown {
  const amount = Number(serviceAmount) || 0
  const type: CommissionType = barber.commissionType ?? 'PERCENTAGE'
  const rate = Number(barber.commissionValue ?? 0)

  let commission = 0
  if (type === 'PERCENTAGE') {
    commission = Math.round(((amount * Math.min(Math.max(rate, 0), 100)) / 100) * 100) / 100
  } else {
    // Fixed naira — clamped so a misconfigured fixed value can never exceed the service price.
    commission = Math.min(Math.max(rate, 0), amount)
  }

  return {
    barberType: barber.barberType ?? 'INTERNAL',
    commissionType: type,
    commissionRate: rate,
    serviceAmount: amount,
    commissionAmount: commission,
    studioAmount: Math.round((amount - commission) * 100) / 100,
  }
}

/**
 * Creates (or refreshes) the PENDING earning row for a finalized booking.
 * Called inside the checkout/appointment creation transaction where possible.
 * The snapshot freezes commission terms from the barber's config NOW.
 */
export async function createEarningSnapshot(
  appointmentId: number,
  barberId: number,
  serviceAmount: number,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const barber = await tx.barber.findUnique({ where: { id: barberId } })
  if (!barber) {
    throw new NotFoundError('Barber not found for commission snapshot.')
  }

  const existing = await tx.barberEarning.findUnique({ where: { appointmentId } })
  if (existing && existing.status !== 'CANCELLED') {
    return existing // idempotent — never duplicate or overwrite a snapshot
  }

  const breakdown = calculateCommission(barber, serviceAmount)

  if (existing) {
    // Cancelled earning from a reactivated appointment — refresh to PENDING
    // with the CURRENT config (the prior attempt never earned).
    return tx.barberEarning.update({
      where: { id: existing.id },
      data: {
        barberId,
        barberTypeSnapshot: breakdown.barberType,
        commissionType: breakdown.commissionType,
        commissionRateSnapshot: breakdown.commissionRate,
        serviceAmount: breakdown.serviceAmount,
        commissionAmount: breakdown.commissionAmount,
        studioAmount: breakdown.studioAmount,
        status: 'PENDING',
        earnedAt: null,
        paidAt: null,
      },
    })
  }

  return tx.barberEarning.create({
    data: {
      appointmentId,
      barberId,
      barberTypeSnapshot: breakdown.barberType,
      commissionType: breakdown.commissionType,
      commissionRateSnapshot: breakdown.commissionRate,
      serviceAmount: breakdown.serviceAmount,
      commissionAmount: breakdown.commissionAmount,
      studioAmount: breakdown.studioAmount,
      status: 'PENDING',
    },
  })
}

/**
 * Applies the lifecycle rules after an appointment status change.
 *   COMPLETED + payment PAID → EARNED
 *   CANCELLED                → CANCELLED (unless already PAID — money was settled)
 */
export async function syncEarningForAppointment(
  appointmentId: number,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } })
  if (!appointment) return

  const earning = await tx.barberEarning.findUnique({ where: { appointmentId } })
  if (!earning) {
    // Appointments created before this feature (or via legacy paths) get their
    // snapshot here, on the first lifecycle transition touching them.
    if (appointment.status !== AppointmentStatusValue.CANCELLED) {
      await createEarningSnapshot(
        appointmentId,
        appointment.assignedBarberId ?? appointment.barberId,
        Number(appointment.totalAmount),
        tx,
      )
    }
    return
  }

  if (earning.status === 'PAID') {
    return // settled money never changes
  }

  if (appointment.status === AppointmentStatusValue.CANCELLED) {
    await tx.barberEarning.update({
      where: { id: earning.id },
      data: { status: 'CANCELLED', earnedAt: null },
    })
    return
  }

  if (appointment.status !== AppointmentStatusValue.COMPLETED) {
    // Moved backwards out of COMPLETED (reactivation flows) → back to PENDING.
    if (earning.status === 'EARNED') {
      await tx.barberEarning.update({
        where: { id: earning.id },
        data: { status: 'PENDING', earnedAt: null },
      })
    }
    return
  }

  // COMPLETED — earned only when the actual money has been confirmed.
  const payment = await tx.payment.findUnique({ where: { appointmentId } })
  const paymentPaid = payment?.status === 'PAID'
  if (paymentPaid) {
    await tx.barberEarning.update({
      where: { id: earning.id },
      data: { status: 'EARNED', earnedAt: new Date() },
    })
    await tx.barberNotification.create({
      data: {
        barberId: earning.barberId,
        type: 'EARNING',
        title: 'Commission earned',
        message: `Your commission of ₦${Number(earning.commissionAmount).toLocaleString()} for appointment #${appointmentId} is now earned and awaiting payout.`,
      },
    })
  }
}

export interface EarningPublic {
  id: number
  appointmentId: number
  referenceCode: string | null
  appointmentDate: string
  appointmentTime: string
  appointmentStatus: string
  paymentStatus: string | null
  customerName: string
  customerLocation: string | null
  barberId: number
  barberName: string | null
  barberTypeSnapshot: BarberType
  barberLocation: string | null
  commissionType: CommissionType
  commissionRateSnapshot: number
  serviceAmount: number
  commissionAmount: number
  studioAmount: number
  status: EarningStatus
  earnedAt: Date | null
  paidAt: Date | null
  createdAt: Date
}

type EarningWithRelations = Prisma.BarberEarningGetPayload<{
  include: {
    appointment: {
      include: {
        payment: { select: { status: true } }
      }
    }
    barber: { select: { id: true; name: true; location: true } }
  }
}>

export function serializeEarning(earning: EarningWithRelations): EarningPublic {
  const appointment = earning.appointment
  return {
    id: earning.id,
    appointmentId: earning.appointmentId,
    referenceCode: appointment?.referenceCode ?? null,
    appointmentDate: appointment?.appointmentDate ?? '',
    appointmentTime: appointment?.appointmentTime ?? '',
    appointmentStatus: appointment?.status ?? '',
    paymentStatus: appointment?.payment?.status ?? null,
    customerName: appointment?.customerName ?? '',
    customerLocation: appointment?.customerLocation ?? null,
    barberId: earning.barberId,
    barberName: earning.barber?.name ?? null,
    barberTypeSnapshot: earning.barberTypeSnapshot,
    barberLocation: earning.barber?.location ?? null,
    commissionType: earning.commissionType,
    commissionRateSnapshot: Number(earning.commissionRateSnapshot),
    serviceAmount: Number(earning.serviceAmount),
    commissionAmount: Number(earning.commissionAmount),
    studioAmount: Number(earning.studioAmount),
    status: earning.status,
    earnedAt: earning.earnedAt,
    paidAt: earning.paidAt,
    createdAt: earning.createdAt,
  }
}

const earningInclude = {
  appointment: {
    include: {
      payment: { select: { status: true } },
    },
  },
  barber: { select: { id: true, name: true, location: true } },
} as const

export async function listEarnings(query: EarningsQuery): Promise<Paged<EarningPublic>> {
  const { page, perPage, offset, limit } = getPagination(query as Record<string, unknown>)

  const where: Prisma.BarberEarningWhereInput = {
    ...(query.barberId ? { barberId: query.barberId } : {}),
    ...(query.barberType ? { barberTypeSnapshot: query.barberType } : {}),
    ...(query.status ? { status: query.status as EarningStatus } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }

  if (query.appointmentRef || query.location) {
    where.appointment = {
      ...(query.appointmentRef ? { referenceCode: { contains: query.appointmentRef } } : {}),
      ...(query.location ? { customerLocation: { contains: query.location } } : {}),
    }
  }

  const [rows, total] = await Promise.all([
    prisma.barberEarning.findMany({
      where,
      include: earningInclude,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.barberEarning.count({ where }),
  ])

  return { items: rows.map(serializeEarning), total, page, perPage }
}

export interface EarningsSummaryRow {
  barberId: number
  barberName: string
  barberType: BarberType
  barberLocation: string | null
  commissionType: CommissionType
  commissionValue: number
  totalAppointments: number
  totalServiceRevenue: number
  totalCommission: number
  studioRevenue: number
  paidCommission: number
  pendingCommission: number
}

/** Per-barber aggregates over the snapshot ledger (requirement #11). */
export async function getEarningsSummary(query: EarningsQuery): Promise<EarningsSummaryRow[]> {
  const barberWhere: Prisma.BarberWhereInput = {
    ...(query.barberType ? { barberType: query.barberType } : {}),
    ...(query.location ? { location: { contains: query.location } } : {}),
  }

  const earningWhere: Prisma.BarberEarningWhereInput = {
    ...(query.status ? { status: query.status as EarningStatus } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }

  const barbers = await prisma.barber.findMany({
    where: barberWhere,
    include: {
      earnings: {
        where: earningWhere,
      },
    },
    orderBy: { name: 'asc' },
  })

  const rows: EarningsSummaryRow[] = []
  for (const barber of barbers) {
    const earnings = barber.earnings ?? []
    if (earnings.length === 0) continue
    const nonCancelled = earnings.filter((e) => e.status !== 'CANCELLED')
    if (nonCancelled.length === 0) continue

    rows.push({
      barberId: barber.id,
      barberName: barber.name,
      barberType: barber.barberType ?? 'INTERNAL',
      barberLocation: barber.location ?? null,
      commissionType: barber.commissionType ?? 'PERCENTAGE',
      commissionValue: Number(barber.commissionValue ?? 0),
      totalAppointments: nonCancelled.length,
      totalServiceRevenue: nonCancelled.reduce((sum, e) => sum + Number(e.serviceAmount), 0),
      totalCommission: nonCancelled.reduce((sum, e) => sum + Number(e.commissionAmount), 0),
      studioRevenue: nonCancelled.reduce((sum, e) => sum + Number(e.studioAmount), 0),
      paidCommission: earnings.filter((e) => e.status === 'PAID').reduce((sum, e) => sum + Number(e.commissionAmount), 0),
      pendingCommission: earnings
        .filter((e) => e.status === 'PENDING' || e.status === 'EARNED')
        .reduce((sum, e) => sum + Number(e.commissionAmount), 0),
    })
  }
  return rows
}

export interface CommissionReport {
  totals: {
    barberRevenue: number
    internalCommission: number
    externalCommission: number
    paidCommission: number
    pendingCommission: number
    studioRevenue: number
  }
  count: number
}

/** Report totals (requirement #18) — filterable by date range, barber, type, location. */
export async function getCommissionReport(query: EarningsQuery): Promise<CommissionReport> {
  let barberIds: number[]
  if (query.barberId) {
    barberIds = [query.barberId]
  } else {
    const barbers = await prisma.barber.findMany({
      where: {
        ...(query.barberType ? { barberType: query.barberType } : {}),
        ...(query.location ? { location: { contains: query.location } } : {}),
      },
      select: { id: true },
    })
    barberIds = barbers.map((b) => b.id)
  }

  if (barberIds.length === 0) {
    return {
      totals: {
        barberRevenue: 0,
        internalCommission: 0,
        externalCommission: 0,
        paidCommission: 0,
        pendingCommission: 0,
        studioRevenue: 0,
      },
      count: 0,
    }
  }

  const where: Prisma.BarberEarningWhereInput = {
    barberId: { in: barberIds },
    ...(query.status ? { status: query.status as EarningStatus } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }

  const earnings = await prisma.barberEarning.findMany({ where })
  const active = earnings.filter((e) => e.status !== 'CANCELLED')

  return {
    totals: {
      barberRevenue: active.reduce((sum, e) => sum + Number(e.serviceAmount), 0),
      internalCommission: active
        .filter((e) => e.barberTypeSnapshot === 'INTERNAL')
        .reduce((sum, e) => sum + Number(e.commissionAmount), 0),
      externalCommission: active
        .filter((e) => e.barberTypeSnapshot === 'EXTERNAL')
        .reduce((sum, e) => sum + Number(e.commissionAmount), 0),
      paidCommission: earnings.filter((e) => e.status === 'PAID').reduce((sum, e) => sum + Number(e.commissionAmount), 0),
      pendingCommission: earnings
        .filter((e) => e.status === 'PENDING' || e.status === 'EARNED')
        .reduce((sum, e) => sum + Number(e.commissionAmount), 0),
      studioRevenue: active.reduce((sum, e) => sum + Number(e.studioAmount), 0),
    },
    count: active.length,
  }
}

export interface BarberPerformanceRow {
  barberId: number
  barberName: string
  barberType: BarberType
  barberLocation: string | null
  isActive: boolean
  totalBookings: number
  completedBookings: number
  cancelledBookings: number
  inProgressBookings: number
  pendingBookings: number
  completionRate: number
  cancellationRate: number
  revenue: number
  avgTicket: number
  commission: number
}

/**
 * Per-barber performance report (requirement #16/#18) — appointment-based
 * metrics that the earnings ledger alone cannot show: bookings, completion /
 * cancellation rates, revenue and average ticket per barber.
 */
export async function getBarberPerformance(query: EarningsQuery): Promise<BarberPerformanceRow[]> {
  const barberWhere: Prisma.BarberWhereInput = {
    ...(query.barberType ? { barberType: query.barberType } : {}),
    ...(query.location ? { location: { contains: query.location } } : {}),
    ...(query.barberId ? { id: query.barberId } : {}),
  }

  const barbers = await prisma.barber.findMany({ where: barberWhere, orderBy: { name: 'asc' } })
  if (barbers.length === 0) return []

  const barberIds = barbers.map((b) => b.id)

  const dateFilter: Prisma.AppointmentWhereInput = {}
  if (query.from || query.to) {
    dateFilter.appointmentDate = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    }
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      OR: [
        { assignedBarberId: { in: barberIds } },
        { assignedBarberId: null, barberId: { in: barberIds } },
      ],
      ...dateFilter,
    },
  })

  const rows: BarberPerformanceRow[] = barbers.map((barber) => {
    const mine = appointments.filter(
      (a) => (a.assignedBarberId ?? a.barberId) === barber.id,
    )
    const completed = mine.filter((a) => a.status === 'COMPLETED')
    const cancelled = mine.filter((a) => a.status === 'CANCELLED')
    const inProgress = mine.filter((a) => a.status === 'IN_PROGRESS')
    const pending = mine.filter(
      (a) =>
        a.status !== 'COMPLETED' && a.status !== 'CANCELLED' && a.status !== 'IN_PROGRESS',
    )
    const billable = completed.length > 0 ? completed : mine.filter((a) => a.status !== 'CANCELLED')
    const revenue = billable.reduce((sum, a) => sum + Number(a.totalAmount), 0)

    return {
      barberId: barber.id,
      barberName: barber.name,
      barberType: barber.barberType ?? 'INTERNAL',
      barberLocation: barber.location ?? null,
      isActive: barber.isActive ?? true,
      totalBookings: mine.length,
      completedBookings: completed.length,
      cancelledBookings: cancelled.length,
      inProgressBookings: inProgress.length,
      pendingBookings: pending.length,
      completionRate: mine.length === 0 ? 0 : Math.round((completed.length / mine.length) * 1000) / 10,
      cancellationRate: mine.length === 0 ? 0 : Math.round((cancelled.length / mine.length) * 1000) / 10,
      revenue,
      avgTicket: billable.length === 0 ? 0 : Math.round((revenue / billable.length) * 100) / 100,
      commission: 0,
    }
  })

  // Commission totals come from the frozen snapshot ledger, not live config
  const earningWhere: Prisma.BarberEarningWhereInput = {
    barberId: { in: barberIds },
    ...(query.status ? { status: query.status as EarningStatus } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }
  const earnings = await prisma.barberEarning.findMany({ where: earningWhere })
  const commissionByBarber = new Map<number, number>()
  for (const earning of earnings) {
    if (earning.status === 'CANCELLED') continue
    commissionByBarber.set(
      earning.barberId,
      (commissionByBarber.get(earning.barberId) ?? 0) + Number(earning.commissionAmount),
    )
  }
  for (const row of rows) {
    row.commission = commissionByBarber.get(row.barberId) ?? 0
  }

  return rows
}

/** Admin settles a payout — only EARNED rows can be marked PAID. */
export async function markEarningPaid(earningId: number): Promise<EarningPublic> {
  const earning = await prisma.barberEarning.findUnique({
    where: { id: earningId },
    include: earningInclude,
  })
  if (!earning) {
    throw new NotFoundError('Earning record not found.')
  }
  if (earning.status !== 'EARNED') {
    throw new UnprocessableError(
      earning.status === 'PAID'
        ? 'This commission has already been paid.'
        : `Only EARNED commissions can be marked as paid (this one is ${earning.status}). Complete the appointment and verify its payment first.`,
    )
  }

  const updated = await prisma.barberEarning.update({
    where: { id: earningId },
    data: { status: 'PAID', paidAt: new Date() },
    include: earningInclude,
  })

  await prisma.barberNotification.create({
    data: {
      barberId: earning.barberId,
      type: 'EARNING',
      title: 'Commission paid',
      message: `Your commission of ₦${Number(earning.commissionAmount).toLocaleString()} for appointment #${earning.appointmentId} has been paid out.`,
    },
  })

  return serializeEarning(updated)
}
