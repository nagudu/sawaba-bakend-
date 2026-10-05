import { prisma } from '../config/database'
import { AppointmentStatusValue } from '../config/appointmentStatuses'
import { NotFoundError } from '../utils/errors'

const SESSION_HOLD_MINUTES = 20
const AWAITING_PAYMENT_HOLD_MINUTES = 45

async function checkoutSessionHolds(
  barberId: number,
  date: string,
  fallbackDuration: number,
): Promise<Array<{ start: number; end: number }>> {
  await prisma.checkoutSession.updateMany({
    where: {
      status: 'OPEN',
      updatedAt: { lt: new Date(Date.now() - SESSION_HOLD_MINUTES * 60 * 1000) },
    },
    data: { status: 'EXPIRED' },
  })

  await prisma.checkoutSession.updateMany({
    where: {
      status: 'AWAITING_PAYMENT',
      updatedAt: { lt: new Date(Date.now() - AWAITING_PAYMENT_HOLD_MINUTES * 60 * 1000) },
    },
    data: { status: 'EXPIRED' },
  })

  const sessions = await prisma.checkoutSession.findMany({
    where: {
      barberId,
      appointmentDate: date,
      status: 'AWAITING_PAYMENT',
    },
  })
  if (sessions.length === 0) return []

  const serviceIds = [...new Set(sessions.map((s) => s.serviceId))]
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } })
  const durationMap = new Map(services.map((s) => [s.id, s.duration]))

  return sessions.map((session) => {
    const start = hhmmToMinutes(session.appointmentTime)
    return { start, end: start + (durationMap.get(session.serviceId) ?? fallbackDuration) }
  })
}

export interface TimeSlot {
  time: string
  endTime: string
  available: boolean
}

export const DEFAULT_HOURS: Record<number, { start: string; end: string }> = {
  0: { start: '11:00', end: '18:00' }, // Sunday
  1: { start: '09:00', end: '20:00' },
  2: { start: '09:00', end: '20:00' },
  3: { start: '09:00', end: '20:00' },
  4: { start: '09:00', end: '20:00' },
  5: { start: '09:00', end: '21:00' }, // Friday
  6: { start: '08:00', end: '21:00' }, // Saturday
}

export function minutesToHHmm(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function hhmmToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function toDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export async function getAvailableTimeSlots(
  barberId: number,
  date: string,
  serviceDurationMinutes = 30,
): Promise<TimeSlot[]> {
  const barber = await prisma.barber.findUnique({ where: { id: barberId } })
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay()
  const barberSchedule = await prisma.barberAvailability.findMany({ where: { barberId } })

  if (barberSchedule.length === 0) {
    const fallback = DEFAULT_HOURS[dayOfWeek]
    if (!fallback) return []

    const existing = await prisma.appointment.findMany({
      where: {
        barberId,
        appointmentDate: date,
        status: { not: AppointmentStatusValue.CANCELLED },
      },
    })

    const bookings = [
      ...existing.map((appointment) => {
        const start = hhmmToMinutes(appointment.appointmentTime)
        return { start, end: start + serviceDurationMinutes }
      }),
      ...(await checkoutSessionHolds(barberId, date, serviceDurationMinutes)),
    ]

    const now = new Date()
    const isToday = date === toDateInput(now)
    const minStartToday = hhmmToMinutes(minutesToHHmm(now.getHours() * 60 + now.getMinutes()))

    const startMin = hhmmToMinutes(fallback.start)
    const endMin = hhmmToMinutes(fallback.end)
    const slots: TimeSlot[] = []
    for (let start = startMin; start + serviceDurationMinutes <= endMin; start += 30) {
      if (isToday && start < minStartToday) continue
      const end = start + serviceDurationMinutes
      const overlaps = bookings.some((booking) => start < booking.end && end > booking.start)
      slots.push({
        time: minutesToHHmm(start),
        endTime: minutesToHHmm(end),
        available: !overlaps,
      })
    }
    return slots
  }

  const availability = barberSchedule.filter((row) => row.dayOfWeek === dayOfWeek && row.isAvailable)
  if (availability.length === 0) return []
  const window = {
    start: hhmmToMinutes(availability[0].startTime),
    end: hhmmToMinutes(availability[0].endTime),
  }

  const existing = await prisma.appointment.findMany({
    where: {
      barberId,
      appointmentDate: date,
      status: { not: AppointmentStatusValue.CANCELLED },
    },
  })

  const serviceIds = [...new Set(existing.map((a) => a.serviceId))]
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } })
  const serviceMap = new Map(services.map((s) => [s.id, s.duration]))

  const bookings = [
    ...existing.map((appointment) => {
      const start = hhmmToMinutes(appointment.appointmentTime)
      const duration = serviceMap.get(appointment.serviceId) ?? serviceDurationMinutes
      return { start, end: start + duration }
    }),
    ...(await checkoutSessionHolds(barberId, date, serviceDurationMinutes)),
  ]

  const now = new Date()
  const isToday = date === toDateInput(now)
  const minStartToday = hhmmToMinutes(minutesToHHmm(now.getHours() * 60 + now.getMinutes()))

  const slots: TimeSlot[] = []
  for (let start = window.start; start + serviceDurationMinutes <= window.end; start += 30) {
    if (isToday && start < minStartToday) continue

    const end = start + serviceDurationMinutes
    const overlaps = bookings.some((booking) => start < booking.end && end > booking.start)
    slots.push({
      time: minutesToHHmm(start),
      endTime: minutesToHHmm(end),
      available: !overlaps,
    })
  }

  return slots
}