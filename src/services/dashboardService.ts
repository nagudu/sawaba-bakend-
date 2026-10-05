import { col, fn, Op } from 'sequelize'
import { Appointment, Barber, Customer, Payment, Service } from '../models'
import { AppointmentStatusValue, CONFIRMED_STATUSES, PENDING_STATUSES } from '../config/appointmentStatuses'

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
    revenueRow,
  ] = await Promise.all([
    Appointment.count(),
    Appointment.count({
      where: { status: { [Op.in]: PENDING_STATUSES } },
    }),
    Appointment.count({
      where: { status: { [Op.in]: CONFIRMED_STATUSES } },
    }),
    Appointment.count({ where: { status: AppointmentStatusValue.COMPLETED } }),
    Appointment.count({ where: { status: AppointmentStatusValue.CANCELLED } }),
    Customer.count(),
    Barber.count(),
    Service.count({ where: { isActive: true } }),
    Payment.count({ where: { status: 'PENDING_VERIFICATION' } }),
    Payment.count({ where: { status: 'PAID' } }),
    Payment.count({ where: { status: 'REJECTED' } }),
    Payment.findOne({
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'revenue']],
      where: { status: 'PAID' },
      raw: true,
    }),
  ])

  const revenueRowValue = (revenueRow as { revenue?: string | number } | null)?.revenue
  const revenue = Number(revenueRowValue ?? 0)

  const recentRaw = await Appointment.findAll({
    order: [['createdAt', 'DESC']],
    limit: 8,
    include: [
      { model: Service, as: 'service', attributes: ['id', 'name'] },
      { model: Barber, as: 'barber', attributes: ['id', 'name'] },
    ],
  })

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