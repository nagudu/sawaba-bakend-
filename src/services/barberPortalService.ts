import { Op } from 'sequelize'
import {
  Appointment,
  BarberEarning,
  BarberNotification,
} from '../models'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'
import { serializeAppointment } from './appointmentService'
import { serializeEarning, syncEarningForAppointment } from './commissionService'
import {
  getBarberAvailability,
  upsertBarberAvailability,
} from './barberService'
import type { BarberAvailabilityInput, BarberPortalQuery } from '../validators/barberPortal'

/**
 * Barber Portal — barber's OWN data. Every query is pinned to `barberId` from
 * the JWT (never client-supplied), and the return shapes reuse the existing
 * admin serializers so nothing new can leak another barber's data.
 */

export async function getBarberPortalOverview(barberId: number) {
  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekKey = weekStart.toISOString().slice(0, 10)
  const monthKey = todayKey.slice(0, 7)

  const [todayAppointments, upcoming, completed, pendingCount, earnings, barber, notifications, unreadCount] =
    await Promise.all([
      Appointment.findAll({
        where: { barberId, appointmentDate: todayKey, status: { [Op.not]: 'CANCELLED' } },
      }),
      Appointment.findAll({
        where: {
          barberId,
          appointmentDate: { [Op.gt]: todayKey },
          status: { [Op.not]: 'CANCELLED' },
        },
      }),
      Appointment.count({ where: { barberId, status: 'COMPLETED' } }),
      Appointment.count({
        where: { barberId, status: { [Op.in]: ['PAYMENT_VERIFIED', 'READY_FOR_SERVICE'] } },
      }),
      BarberEarning.findAll({ where: { barberId } }),
      (await import('../models')).Barber.findByPk(barberId, { attributes: ['commissionType', 'commissionValue'] }),
      BarberNotification.findAll({
        where: { barberId },
        order: [['createdAt', 'DESC']],
        limit: 5,
      }),
      BarberNotification.count({ where: { barberId, readAt: null } }),
    ])

  const sum = (rows: typeof earnings) => rows.reduce((total, e) => total + Number(e.commissionAmount), 0)
  const todayEarnings = sum(earnings.filter((e) => e.earnedAt && e.earnedAt.toISOString().slice(0, 10) === todayKey))
  const weekEarnings = sum(earnings.filter((e) => e.earnedAt && e.earnedAt.toISOString().slice(0, 10) >= weekKey))
  const monthEarnings = sum(earnings.filter((e) => e.earnedAt && e.earnedAt.toISOString().slice(0, 7) === monthKey))

  const dueSoon = todayAppointments
    .filter((a) => a.status === 'READY_FOR_SERVICE' || a.status === 'PAYMENT_VERIFIED')
    .sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime))
    .slice(0, 6)
    .map((a) => serializeAppointment(a))

  return {
    todayCount: todayAppointments.filter((a) => a.status !== 'IN_PROGRESS').length,
    daysUpcomingCount: upcoming.length,
    completedCount: completed,
    pendingCount,
    todayEarnings,
    weekEarnings,
    monthEarnings,
    totalEarnings: sum(earnings.filter((e) => e.status === 'EARNED' || e.status === 'PAID')),
    pendingCommission: sum(earnings.filter((e) => e.status === 'PENDING' || e.status === 'EARNED')),
    commissionType: barber?.commissionType ?? 'PERCENTAGE',
    commissionValue: Number(barber?.commissionValue ?? 0),
    unreadCount,
    dueSoon,
    notifications: notifications.map((n) => serializeNotification(n)),
  }
}

export async function listBarberPortalAppointments(
  barberId: number,
  query: BarberPortalQuery,
) {
  const { offset, limit, page, perPage } = getPagination(query as Record<string, unknown>)
  // A barber works an appointment when they are the booked barber OR the
  // admin-assigned barber — assignments are the operative field for the
  // customer → admin → barber flow.
  const where: Record<string, unknown> = {
    [Op.or]: [{ barberId }, { assignedBarberId: barberId }],
  }

  if (query.status) where.status = query.status
  if (query.from || query.to) {
    where.appointmentDate = {
      ...(query.from ? { [Op.gte]: query.from } : {}),
      ...(query.to ? { [Op.lte]: query.to } : {}),
    }
  }

  const { rows, count } = await Appointment.findAndCountAll({
    where,
    include: [
      {
        model: (await import('../models')).Service,
        as: 'service',
        attributes: ['id', 'name', 'price', 'duration'],
      },
    ],
    order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
    offset,
    limit,
  })

  return {
    items: rows.map((a) => serializeAppointment(a)),
    total: count,
    page,
    perPage,
  }
}

export async function getBarberPortalAppointment(barberId: number, appointmentId: number) {
  const appointment = await Appointment.findOne({
    where: {
      id: appointmentId,
      [Op.or]: [{ barberId }, { assignedBarberId: barberId }],
    },
  })
  if (!appointment) {
    throw new NotFoundError('Appointment not found for this barber.')
  }
  return serializeAppointment(appointment)
}

/** Barber marks their own appointment IN_PROGRESS → COMPLETED (their session). */
export async function updateBarberPortalAppointmentStatus(
  barberId: number,
  appointmentId: number,
  to: 'IN_PROGRESS' | 'COMPLETED',
) {
  const appointment = await Appointment.findOne({
    where: {
      id: appointmentId,
      [Op.or]: [{ barberId }, { assignedBarberId: barberId }],
    },
  })
  if (!appointment) {
    throw new NotFoundError('Appointment not found for this barber.')
  }

  if (to === 'IN_PROGRESS') {
    if (appointment.status !== 'READY_FOR_SERVICE') {
      throw new UnprocessableError('Only READY_FOR_SERVICE appointments can be started.')
    }
    await appointment.update({ status: 'IN_PROGRESS' })
  } else {
    if (appointment.status !== 'IN_PROGRESS') {
      throw new UnprocessableError('Only IN_PROGRESS appointments can be completed.')
    }
    await appointment.update({ status: 'COMPLETED', completedAt: new Date() })
  }

  // Re-sync the earning ledger: a completed appointment with a PAID payment
  // becomes EARNED in the barber's ledger.
  await syncEarningForAppointment(appointment.id)

  return serializeAppointment(appointment)
}

export async function listBarberPortalEarnings(barberId: number, query: BarberPortalQuery) {
  const { offset, limit, page, perPage } = getPagination(query as Record<string, unknown>)
  const where: Record<string, unknown> = { barberId }
  if (query.status) where.status = query.status
  if (query.earningStatus) where.status = query.earningStatus

  const { rows, count } = await BarberEarning.findAndCountAll({
    where,
    include: [
      { model: Appointment, as: 'appointment', attributes: ['id', 'referenceCode', 'serviceId', 'totalAmount', 'appointmentDate'] },
    ],
    order: [['createdAt', 'DESC']],
    offset,
    limit,
  })

  return {
    items: rows.map((e) => serializeEarning(e)),
    total: count,
    page,
    perPage,
  }
}

export async function listBarberPortalNotifications(barberId: number, query: BarberPortalQuery) {
  const { offset, limit, page, perPage } = getPagination(query as Record<string, unknown>)
  const { rows, count } = await BarberNotification.findAndCountAll({
    where: { barberId },
    order: [['createdAt', 'DESC']],
    offset,
    limit,
  })
  return {
    items: rows.map((n) => serializeNotification(n)),
    unreadCount: await BarberNotification.count({ where: { barberId, readAt: null } }),
    total: count,
    page,
    perPage,
  }
}

export async function markBarberPortalNotificationRead(
  barberId: number,
  notificationId?: number,
): Promise<void> {
  const where: Record<string, unknown> = { barberId }
  if (notificationId) where.id = notificationId

  const target = notificationId
    ? await BarberNotification.findOne({ where })
    : null
  if (notificationId && !target) {
    throw new NotFoundError('Notification not found.')
  }

  if (notificationId) {
    await target!.update({ readAt: new Date() })
  } else {
    await BarberNotification.update({ readAt: new Date() }, { where: { barberId, readAt: null } })
  }
}

export async function getBarberPortalAvailability(barberId: number) {
  return getBarberAvailability(barberId)
}

export async function upsertBarberPortalAvailability(
  barberId: number,
  input: BarberAvailabilityInput | BarberAvailabilityInput[],
) {
  const entries = Array.isArray(input) ? input : [input]
  return upsertBarberAvailability(barberId, entries)
}

function serializeNotification(notification: BarberNotification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  }
}

/** Converts a bare "HH:mm" clock into minutes past midnight for slot math. */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export { toMinutes }