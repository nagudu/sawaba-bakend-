import { Op } from 'sequelize'
import { Appointment, Barber, BarberAvailability, CheckoutSession, Service } from '../models'
import { AppointmentStatusValue } from '../config/appointmentStatuses'
import { NotFoundError } from '../utils/errors'

/**
 * How long checkout sessions may hold their slot.
 *
 * STRICT AVAILABILITY RULE: a slot only shows as unavailable when a REAL
 * booking (appointment) or a payment genuinely in flight occupies it.
 * Merely-staged (OPEN) sessions hold NOTHING — a customer who abandons a
 * checkout must never make a free slot look taken to everyone else.
 * Sessions already inside a Paystack checkout (money possibly in flight) do
 * hold for 45 minutes — longer than Paystack's own 30-minute transaction
 * expiry, so a slow-but-honest payment can never be orphaned.
 */
const SESSION_HOLD_MINUTES = 20
const AWAITING_PAYMENT_HOLD_MINUTES = 45

/** Expires stale checkout sessions, then returns the slot intervals they hold. */
async function checkoutSessionHolds(
  barberId: number,
  date: string,
  fallbackDuration: number,
): Promise<Array<{ start: number; end: number }>> {
  await CheckoutSession.update(
    { status: 'EXPIRED' },
    {
      where: {
        status: 'OPEN',
        updatedAt: { [Op.lt]: new Date(Date.now() - SESSION_HOLD_MINUTES * 60 * 1000) },
      },
    },
  )
  await CheckoutSession.update(
    { status: 'EXPIRED' },
    {
      where: {
        status: 'AWAITING_PAYMENT',
        updatedAt: { [Op.lt]: new Date(Date.now() - AWAITING_PAYMENT_HOLD_MINUTES * 60 * 1000) },
      },
    },
  )

  // ONLY in-flight payments hold a slot. Staged-but-unpaid sessions do not.
  const sessions = await CheckoutSession.findAll({
    where: {
      barberId,
      appointmentDate: date,
      status: 'AWAITING_PAYMENT',
    },
  })
  if (sessions.length === 0) return []

  const serviceIds = [...new Set(sessions.map((s) => s.serviceId))]
  const services = await Service.findAll({ where: { id: serviceIds } })
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

/**
 * Default opening hours for barbers the admin has not configured yet.
 * Mirrors the seeded schedule so unconfigured barbers stay bookable
 * instead of silently having zero slots.
 */
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

/** Returns the list of bookable time slots for a barber on a given date. */
export async function getAvailableTimeSlots(
  barberId: number,
  date: string,
  serviceDurationMinutes = 30,
): Promise<TimeSlot[]> {
  const barber = await Barber.findByPk(barberId)
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay()

  // Configured barbers use their own schedule; barbers with no availability
  // rows at all fall back to the salon's default opening hours so they stay
  // bookable (an admin can still restrict them from the dashboard).
  const barberSchedule = await BarberAvailability.findAll({ where: { barberId } })
  if (barberSchedule.length === 0) {
    const fallback = DEFAULT_HOURS[dayOfWeek]
    if (!fallback) return []
    const existing = await Appointment.findAll({
      where: {
        barberId,
        appointmentDate: date,
        status: { [Op.ne]: AppointmentStatusValue.CANCELLED },
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

  const existing = await Appointment.findAll({
    where: {
      barberId,
      appointmentDate: date,
      status: { [Op.ne]: AppointmentStatusValue.CANCELLED },
    },
  })

  const serviceIds = [...new Set(existing.map((a) => a.serviceId))]
  const services = await Service.findAll({ where: { id: serviceIds } })
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