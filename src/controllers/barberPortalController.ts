import type { NextFunction, Request, Response } from 'express'
import {
  getBarberPortalOverview,
  listBarberPortalAppointments,
  getBarberPortalAppointment,
  updateBarberPortalAppointmentStatus,
  listBarberPortalEarnings,
  listBarberPortalNotifications,
  markBarberPortalNotificationRead,
  getBarberPortalAvailability,
  upsertBarberPortalAvailability,
} from '../services/barberPortalService'
import { successRes } from '../utils/response'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>

/** Wraps a service call so thrown errors reach the central error middleware. */
const handle =
  (run: (req: Request) => Promise<{ message: string; data?: unknown; status?: number }>): Handler =>
  async (req, res, next) => {
    try {
      const { message, data, status = 200 } = await run(req)
      successRes(res, message, data, status)
    } catch (error) {
      next(error)
    }
  }

export const getBarberPortalOverviewHandler: Handler = handle(async (req) => ({
  message: 'Barber portal overview fetched.',
  data: { overview: await getBarberPortalOverview(req.barber!.id) },
}))

export const listBarberPortalAppointmentsHandler: Handler = handle(async (req) => ({
  message: 'Barber appointments fetched.',
  data: await listBarberPortalAppointments(req.barber!.id, req.query as never),
}))

export const getBarberPortalAppointmentHandler: Handler = handle(async (req) => ({
  message: 'Appointment fetched.',
  data: {
    appointment: await getBarberPortalAppointment(req.barber!.id, Number(req.params.appointmentId)),
  },
}))

export const updateBarberPortalAppointmentStatusHandler: Handler = handle(async (req) => ({
  message: 'Appointment status updated.',
  data: {
    appointment: await updateBarberPortalAppointmentStatus(
      req.barber!.id,
      Number(req.params.appointmentId),
      req.body.to,
    ),
  },
}))

export const listBarberPortalEarningsHandler: Handler = handle(async (req) => ({
  message: 'Barber earnings fetched.',
  data: await listBarberPortalEarnings(req.barber!.id, req.query as never),
}))

export const listBarberPortalNotificationsHandler: Handler = handle(async (req) => ({
  message: 'Barber notifications fetched.',
  data: await listBarberPortalNotifications(req.barber!.id, req.query as never),
}))

export const markBarberNotificationsReadHandler: Handler = handle(async (req) => {
  await markBarberPortalNotificationRead(req.barber!.id, req.body.notificationId)
  return { message: 'Notifications updated.' }
})

export const getBarberPortalAvailabilityHandler: Handler = handle(async (req) => ({
  message: 'Barber availability fetched.',
  data: { availability: await getBarberPortalAvailability(req.barber!.id) },
}))

export const upsertBarberPortalAvailabilityHandler: Handler = handle(async (req) => ({
  message: 'Barber availability saved.',
  data: { availability: await upsertBarberPortalAvailability(req.barber!.id, req.body) },
}))
