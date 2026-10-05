import { prisma } from '../config/database'
import type { Appointment } from '@prisma/client'
import { AppointmentStatusValue } from '../config/appointmentStatuses'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { getAppointmentById } from './appointmentService'
import { createEarningSnapshot } from './commissionService'
import { hhmmToMinutes } from './availabilityService'
import type { AssignBarberInput } from '../validators/barberEarning'
import type { AppointmentPublic } from './appointmentService'

async function assertBarberAssignable(barberId: number, appointment: Appointment): Promise<void> {
  const barber = await prisma.barber.findUnique({ where: { id: barberId } })
  if (!barber) throw new NotFoundError('Selected barber not found.')
  if (!barber.isActive) {
    throw new UnprocessableError(`${barber.name} is inactive and cannot take appointments.`)
  }

  const serviceLink = await prisma.barberService.findUnique({
    where: {
      barberId_serviceId: {
        barberId,
        serviceId: appointment.serviceId,
      },
    },
  })
  if (!serviceLink) {
    const service = await prisma.service.findUnique({
      where: { id: appointment.serviceId },
      select: { name: true },
    })
    throw new UnprocessableError(
      `${barber.name} does not provide ${service?.name ?? 'this service'} and cannot be assigned.`,
    )
  }

  const dayOfWeek = new Date(`${appointment.appointmentDate}T00:00:00`).getDay()
  const schedule = await prisma.barberAvailability.findMany({
    where: { barberId, dayOfWeek, isAvailable: true },
  })
  if (schedule.length > 0) {
    const startMin = hhmmToMinutes(appointment.appointmentTime)
    const service = await prisma.service.findUnique({
      where: { id: appointment.serviceId },
      select: { duration: true },
    })
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

  const serviceRecord = await prisma.service.findUnique({
    where: { id: appointment.serviceId },
    select: { duration: true },
  })
  const duration = serviceRecord?.duration ?? 30
  const startMin = hhmmToMinutes(appointment.appointmentTime)
  const endMin = startMin + duration

  const sameDay = await prisma.appointment.findMany({
    where: {
      appointmentDate: appointment.appointmentDate,
      status: { not: AppointmentStatusValue.CANCELLED },
      id: { not: appointment.id },
      OR: [{ barberId }, { assignedBarberId: barberId }],
    },
    include: { service: { select: { duration: true } } },
  })

  for (const other of sameDay) {
    const otherDuration = other.service?.duration ?? duration
    const otherStart = hhmmToMinutes(other.appointmentTime)
    const otherEnd = otherStart + otherDuration
    if (startMin < otherEnd && endMin > otherStart) {
      throw new UnprocessableError(
        `${barber.name} is already booked at ${other.appointmentTime} on ${appointment.appointmentDate} (appointment ${other.referenceCode ?? `#${other.id}`}). Double-booking is not allowed.`,
      )
    }
  }
}

export async function getAssignmentHistory(appointmentId: number) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } })
  if (!appointment) {
    throw new NotFoundError('Appointment not found.')
  }
  const rows = await prisma.barberAssignmentHistory.findMany({
    where: { appointmentId },
    include: {
      previousBarber: { select: { id: true, name: true } },
      newBarber: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
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
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } })
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
  const next = input.barberId

  if (next === effectiveCurrent) {
    return getAppointmentById(appointmentId)
  }

  const action = next === null ? 'REMOVED' : currentAssignment === null ? 'ASSIGNED' : 'REASSIGNED'

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        assignedBarberId: next,
        assignedAt: next ? new Date() : null,
        assignedBy: next ? adminId : null,
      },
    })

    await tx.barberAssignmentHistory.create({
      data: {
        appointmentId,
        previousBarberId: effectiveCurrent,
        newBarberId: next,
        action,
        reason: input.reason?.trim() || null,
        changedByAdminId: adminId,
      },
    })

    const earning = await tx.barberEarning.findUnique({ where: { appointmentId } })
    if (next !== null && (!earning || earning.status !== 'PAID')) {
      if (earning) await tx.barberEarning.delete({ where: { appointmentId } })
      await createEarningSnapshot(
        appointmentId,
        next,
        Number(appointment.totalAmount),
        tx,
      )
    }

    if (next !== null) {
      await tx.barberNotification.create({
        data: {
          barberId: next,
          type: 'ASSIGNMENT',
          title: action === 'REASSIGNED' ? 'New appointment reassigned to you' : 'New appointment assigned to you',
          message: `Appointment ${appointment.referenceCode ?? `#${appointmentId}`} (${appointment.appointmentDate} ${appointment.appointmentTime})${input.reason ? ` — reason: ${input.reason.trim()}` : ''}.`,
        },
      })
    }
  })

  return getAppointmentById(appointmentId)
}
