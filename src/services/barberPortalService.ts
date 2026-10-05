import { prisma } from '../config/database'
import type { BarberNotification, AppointmentStatus, EarningStatus } from '@prisma/client'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'
import { serializeAppointment } from './appointmentService'
import { serializeEarning, syncEarningForAppointment } from './commissionService'
import {
  getBarberAvailability,
  upsertBarberAvailability,
} from './barberService'
import type { BarberAvailabilityInput, BarberPortalQuery } from '../validators/barberPortal'

export async function getBarberPortalOverview(barberId: number) {
  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekKey = weekStart.toISOString().slice(0, 10)
  const monthKey = todayKey.slice(0, 7)

  const [todayAppointments, upcoming, completed, pendingCount, earnings, barber, notifications, unreadCount] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { barberId, appointmentDate: todayKey, status: { not: 'CANCELLED' } },
        include: {
          service: { select: { id: true, name: true, price: true, duration: true } },
          barber: { select: { id: true, name: true, image: true } },
        },
      }),
      prisma.appointment.findMany({
        where: {
          barberId,
          appointmentDate: { gt: todayKey },
          status: { not: 'CANCELLED' },
        },
      }),
      prisma.appointment.count({ where: { barberId, status: 'COMPLETED' } }),
      prisma.appointment.count({
        where: { barberId, status: { in: ['PAYMENT_VERIFIED', 'READY_FOR_SERVICE'] } },
      }),
      prisma.barberEarning.findMany({ where: { barberId } }),
      prisma.barber.findUnique({
        where: { id: barberId },
        select: { commissionType: true, commissionValue: true },
      }),
      prisma.barberNotification.findMany({
        where: { barberId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.barberNotification.count({ where: { barberId, readAt: null } }),
    ])

  const sum = (rows: typeof earnings) => rows.reduce((total, e) => total + Number(e.commissionAmount), 0)
  const todayEarnings = sum(earnings.filter((e) => e.earnedAt && e.earnedAt.toISOString().slice(0, 10) === todayKey))
  const weekEarnings = sum(earnings.filter((e) => e.earnedAt && e.earnedAt.toISOString().slice(0, 10) >= weekKey))
  const monthEarnings = sum(earnings.filter((e) => e.earnedAt && e.earnedAt.toISOString().slice(0, 7) === monthKey))

  const dueSoon = todayAppointments
    .filter((a) => a.status === 'READY_FOR_SERVICE' || a.status === 'PAYMENT_VERIFIED')
    .sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime))
    .slice(0, 6)
    .map((a) => serializeAppointment(a as never))

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

  const where: {
    OR?: Array<{ barberId: number } | { assignedBarberId: number }>
    status?: AppointmentStatus
    appointmentDate?: { gte?: string; lte?: string }
  } = {
    OR: [{ barberId }, { assignedBarberId: barberId }],
  }

  if (query.status) where.status = query.status as AppointmentStatus
  if (query.from || query.to) {
    where.appointmentDate = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    }
  }

  const [rows, count] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, price: true, duration: true } },
        barber: { select: { id: true, name: true, image: true } },
        assignedBarber: { select: { id: true, name: true, image: true } },
        payment: true,
      },
      orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
      skip: offset,
      take: limit,
    }),
    prisma.appointment.count({ where }),
  ])

  return {
    items: rows.map((a) => serializeAppointment(a)),
    total: count,
    page,
    perPage,
  }
}

export async function getBarberPortalAppointment(barberId: number, appointmentId: number) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      OR: [{ barberId }, { assignedBarberId: barberId }],
    },
    include: {
      service: { select: { id: true, name: true, price: true, duration: true } },
      barber: { select: { id: true, name: true, image: true } },
      assignedBarber: { select: { id: true, name: true, image: true } },
      payment: true,
    },
  })
  if (!appointment) {
    throw new NotFoundError('Appointment not found for this barber.')
  }
  return serializeAppointment(appointment)
}

export async function updateBarberPortalAppointmentStatus(
  barberId: number,
  appointmentId: number,
  to: 'IN_PROGRESS' | 'COMPLETED',
) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      OR: [{ barberId }, { assignedBarberId: barberId }],
    },
  })
  if (!appointment) {
    throw new NotFoundError('Appointment not found for this barber.')
  }

  let updated
  if (to === 'IN_PROGRESS') {
    if (appointment.status !== 'READY_FOR_SERVICE') {
      throw new UnprocessableError('Only READY_FOR_SERVICE appointments can be started.')
    }
    updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'IN_PROGRESS', serviceStartedAt: new Date() },
      include: {
        service: { select: { id: true, name: true, price: true, duration: true } },
        barber: { select: { id: true, name: true, image: true } },
        payment: true,
      },
    })
  } else {
    if (appointment.status !== 'IN_PROGRESS') {
      throw new UnprocessableError('Only IN_PROGRESS appointments can be completed.')
    }
    updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'COMPLETED', completedAt: new Date() },
      include: {
        service: { select: { id: true, name: true, price: true, duration: true } },
        barber: { select: { id: true, name: true, image: true } },
        payment: true,
      },
    })
  }

  await syncEarningForAppointment(appointment.id)
  return serializeAppointment(updated as never)
}

export async function listBarberPortalEarnings(barberId: number, query: BarberPortalQuery) {
  const { offset, limit, page, perPage } = getPagination(query as Record<string, unknown>)
  const where: { barberId: number; status?: EarningStatus } = { barberId }
  if (query.status) where.status = query.status as EarningStatus
  if (query.earningStatus) where.status = query.earningStatus as EarningStatus

  const [rows, count] = await Promise.all([
    prisma.barberEarning.findMany({
      where,
      include: {
        appointment: {
          include: {
            payment: { select: { status: true } },
          },
        },
        barber: { select: { id: true, name: true, location: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.barberEarning.count({ where }),
  ])

  return {
    items: rows.map((e) => serializeEarning(e as never)),
    total: count,
    page,
    perPage,
  }
}

export async function listBarberPortalNotifications(barberId: number, query: BarberPortalQuery) {
  const { offset, limit, page, perPage } = getPagination(query as Record<string, unknown>)
  const [rows, count] = await Promise.all([
    prisma.barberNotification.findMany({
      where: { barberId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.barberNotification.count({ where: { barberId } }),
  ])
  return {
    items: rows.map((n) => serializeNotification(n)),
    unreadCount: await prisma.barberNotification.count({ where: { barberId, readAt: null } }),
    total: count,
    page,
    perPage,
  }
}

export async function markBarberPortalNotificationRead(
  barberId: number,
  notificationId?: number,
): Promise<void> {
  if (notificationId) {
    const target = await prisma.barberNotification.findFirst({
      where: { id: notificationId, barberId },
    })
    if (!target) {
      throw new NotFoundError('Notification not found.')
    }
    await prisma.barberNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    })
  } else {
    await prisma.barberNotification.updateMany({
      where: { barberId, readAt: null },
      data: { readAt: new Date() },
    })
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

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export { toMinutes }