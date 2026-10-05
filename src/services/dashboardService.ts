import { prisma } from '../config/database'
import { AppointmentStatusValue, CONFIRMED_STATUSES, PENDING_STATUSES } from '../config/appointmentStatuses'
import type { AppointmentStatus } from '@prisma/client'

export interface DashboardData {
  totals: {
    appointments: number
    pending: number
    confirmed: number
    completed: number
    cancelled: number
    customers: number
    barbers: number
    services: number
  }
  payments: {
    pendingVerification: number
    paid: number
    rejected: number
    revenue: number
  }
  recentAppointments: Array<{
    id: number
    referenceCode?: string | null
    customerName: string
    appointmentDate: string
    appointmentTime: string
    status: string
    service: { id: number; name: string } | null
    barber: { id: number; name: string } | null
  }>
}

export async function getDashboardData(): Promise<DashboardData> {
  const [
    appointments,
    pending,
    confirmed,
    completed,
    cancelled,
    customers,
    barbers,
    services,
    pendingVerification,
    paid,
    rejected,
    revenueAggregate,
    recentRaw,
  ] = await Promise.all([
    prisma.appointment.count(),
    prisma.appointment.count({
      where: { status: { in: PENDING_STATUSES as unknown as AppointmentStatus[] } },
    }),
    prisma.appointment.count({
      where: { status: { in: CONFIRMED_STATUSES as unknown as AppointmentStatus[] } },
    }),
    prisma.appointment.count({ where: { status: AppointmentStatusValue.COMPLETED } }),
    prisma.appointment.count({ where: { status: AppointmentStatusValue.CANCELLED } }),
    prisma.customer.count(),
    prisma.barber.count(),
    prisma.service.count({ where: { isActive: true } }),
    prisma.payment.count({ where: { status: 'PENDING_VERIFICATION' } }),
    prisma.payment.count({ where: { status: 'PAID' } }),
    prisma.payment.count({ where: { status: 'REJECTED' } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'PAID' },
    }),
    prisma.appointment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        service: { select: { id: true, name: true } },
        barber: { select: { id: true, name: true } },
      },
    }),
  ])

  const revenue = Number(revenueAggregate._sum.amount ?? 0)

  return {
    totals: {
      appointments,
      pending,
      confirmed,
      completed,
      cancelled,
      customers,
      barbers,
      services,
    },
    payments: {
      pendingVerification,
      paid,
      rejected,
      revenue,
    },
    recentAppointments: recentRaw.map((appointment) => ({
      id: appointment.id,
      referenceCode: appointment.referenceCode,
      customerName: appointment.customerName,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      status: appointment.status,
      service: appointment.service
        ? { id: appointment.service.id, name: appointment.service.name }
        : null,
      barber: appointment.barber
        ? { id: appointment.barber.id, name: appointment.barber.name }
        : null,
    })),
  }
}