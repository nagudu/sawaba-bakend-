import { Op } from 'sequelize'
import { sequelize } from '../config/database'
import { Appointment, Barber, BarberAssignmentHistory, BarberAvailability, BarberEarning, BarberNotification, BarberService, Service } from '../models'
import { AppointmentStatusValue } from '../config/appointmentStatuses'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { getAppointmentById } from './appointmentService'
import { createEarningSnapshot } from './commissionService'
import { hhmmToMinutes } from './availabilityService'
import type { AssignBarberInput } from '../validators/barberEarning'
import type { AppointmentPublic } from './appointmentService'

/**
 * Pre-assignment eligibility checks (requirement: never double-book, never
 * assign an inactive/mismatched barber). Returns nothing — throws a
 * descriptive UnprocessableError explaining exactly why assignment must fail.
 */
async function assertBarberAssignable(barberId: number, appointment: Appointment): Promise<void> {
  const barber = await Barber.findByPk(barberId)
  if (!barber) throw new NotFoundError('Selected barber not found.')
  if (!barber.isActive) {
    throw new UnprocessableError(`${barber.name} is inactive and cannot take appointments.`)
  }

  // The barber must actually provide the appointment's service.
  const serviceLink = await BarberService.findOne({
    where: { barberId, serviceId: appointment.serviceId },
  })
  if (!serviceLink) {
    const service = await Service.findByPk(appointment.serviceId, { attributes: ['name'] })
    throw new UnprocessableError(
      `${barber.name} does not provide ${service?.name ?? 'this service'} and cannot be assigned.`,
    )
  }

  // Working-hours check (only when the barber has a configured schedule).
  const dayOfWeek = new Date(`${appointment.appointmentDate}T00:00:00`).getDay()
  const schedule = await BarberAvailability.findAll({
    where: { barberId, dayOfWeek, isAvailable: true },
  })
  if (schedule.length > 0) {
    const startMin = hhmmToMinutes(appointment.appointmentTime)
    const service = await Service.findByPk(appointment.serviceId, { attributes: ['duration'] })
    const endMin = startMin + (service?.duration ?? 30)
    const within = schedule.some(
      (row) => startMin >= hhmmToMinutes(row.startTime) && endMin <= hhmmToMinutes(row.endTime),
    )
    if (!within) {
      throw new UnprocessableError(
        `${appointment.appointmentTime} is outside ${barber.name}'s working hours on ${appointment.appointmentDate}.`,
      )
    }
  }

  // Double-booking check against every non-cancelled appointment in the
  // target barber's calendar for that date — including appointments where
  // they are the ASSIGNED barber, not just the booked one.
  const duration = (await Service.findByPk(appointment.serviceId, { attributes: ['duration'] }))?.duration ?? 30
  const startMin = hhmmToMinutes(appointment.appointmentTime)
  const endMin = startMin + duration
  const sameDay = await Appointment.findAll({
    where: {
      appointmentDate: appointment.appointmentDate,
      status: { [Op.ne]: AppointmentStatusValue.CANCELLED },
      id: { [Op.ne]: appointment.id },
      [Op.or]: [{ barberId }, { assignedBarberId: barberId }],
    },
    include: [{ model: Service, as: 'service', attributes: ['duration'] }],
  })
  for (const other of sameDay) {
    const otherDuration = (other as unknown as { service?: { duration?: number } | null }).service?.duration ?? duration
    const otherStart = hhmmToMinutes(other.appointmentTime)
    const otherEnd = otherStart + otherDuration
    if (startMin < otherEnd && endMin > otherStart) {
      throw new UnprocessableError(
        `${barber.name} is already booked at ${other.appointmentTime} on ${appointment.appointmentDate} (appointment ${other.referenceCode ?? `#${other.id}`}). Double-booking is not allowed.`,
      )
    }
  }
}

/**
 * Admin barber assignment (requirement #5/#6).
 *
 * The customer's booked barber always stays on `barberId` — `assignedBarberId`
 * records the barber admin actually assigns. Admin has FINAL authority:
 * customers can never modify these fields (the customer-facing endpoints and
 * serializers never accept or expose them).
 */

export async function getAssignmentHistory(appointmentId: number) {
  const appointment = await Appointment.findByPk(appointmentId)
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }
  const rows = await BarberAssignmentHistory.findAll({
    where: { appointmentId },
    include: [
      { model: Barber, as: 'previousBarber', attributes: ['id', 'name'] },
      { model: Barber, as: 'newBarber', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
  })
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    previousBarber: row.previousBarber ? { id: row.previousBarber.id, name: row.previousBarber.name } : null,
    newBarber: row.newBarber ? { id: row.newBarber.id, name: row.newBarber.name } : null,
    reason: row.reason,
    createdAt: row.createdAt,
  }))
}

export async function assignBarber(
  appointmentId: number,
  input: AssignBarberInput,
  adminId: number | null,
): Promise<AppointmentPublic> {
  const appointment = await Appointment.findByPk(appointmentId)
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }
  if (appointment.status === 'CANCELLED') {
    throw new UnprocessableError('Cancelled bookings cannot be reassigned. Reactivate the booking first.')
  }

  if (input.barberId !== null) {
    await assertBarberAssignable(input.barberId, appointment)
  }

  const currentAssignment = appointment.assignedBarberId ?? null
  const effectiveCurrent = currentAssignment ?? appointment.barberId
  const next = input.barberId // null = remove assignment (fall back to booked barber)

  if (next === effectiveCurrent) {
    // No-op — keep it idempotent.
    return getAppointmentById(appointmentId)
  }

  const action = next === null ? 'REMOVED' : currentAssignment === null ? 'ASSIGNED' : 'REASSIGNED'

  await sequelize.transaction(async (t) => {
    await appointment.update(
      {
        assignedBarberId: next,
        assignedAt: next ? new Date() : null,
        assignedBy: next ? adminId : null,
      },
      { transaction: t },
    )

    await BarberAssignmentHistory.create(
      {
        appointmentId,
        previousBarberId: effectiveCurrent,
        newBarberId: next,
        action,
        reason: input.reason?.trim() || null,
        changedByAdminId: adminId,
      },
      { transaction: t },
    )

    // The earning must follow the barber who will actually perform the work.
    // Re-snapshot with the NEW barber's CURRENT config; a PAID row is left
    // alone (money already settled against the old barber).
    const earning = await BarberEarning.findOne({ where: { appointmentId }, transaction: t })
    if (next !== null && (!earning || earning.status !== 'PAID')) {
      if (earning) await earning.destroy({ transaction: t })
      await createEarningSnapshot(
        appointmentId,
        next,
        Number(appointment.totalAmount),
        t,
      )
    }

    // Notify the target barber (in-app, barber portal).
    if (next !== null) {
      await BarberNotification.create(
        {
          barberId: next,
          type: 'ASSIGNMENT',
          title: action === 'REASSIGNED' ? 'New appointment reassigned to you' : 'New appointment assigned to you',
          message: `Appointment ${appointment.referenceCode ?? `#${appointmentId}`} (${appointment.appointmentDate} ${appointment.appointmentTime})${input.reason ? ` — reason: ${input.reason.trim()}` : ''}.`,
        },
        { transaction: t },
      )
    }
  })

  return getAppointmentById(appointmentId)
}
