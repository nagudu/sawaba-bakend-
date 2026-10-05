import { Router } from 'express'
import { requireBarber } from '../middleware/barberAuth'
import { validate } from '../middleware/validate'
import {
  barberPortalQuerySchema,
  barberAppointmentTimeParamsSchema,
  barberMarkNotificationReadSchema,
  barberAvailabilityBodySchema,
} from '../validators/barberPortal'
import {
  getBarberPortalOverviewHandler,
  listBarberPortalAppointmentsHandler,
  getBarberPortalAppointmentHandler,
  updateBarberPortalAppointmentStatusHandler,
  listBarberPortalEarningsHandler,
  listBarberPortalNotificationsHandler,
  markBarberNotificationsReadHandler,
  getBarberPortalAvailabilityHandler,
  upsertBarberPortalAvailabilityHandler,
} from '../controllers/barberPortalController'

export const barberPortalRouter = Router()

barberPortalRouter.use(requireBarber)

barberPortalRouter.get('/overview', getBarberPortalOverviewHandler)
barberPortalRouter.get('/appointments', validate(barberPortalQuerySchema, 'query'), listBarberPortalAppointmentsHandler)
barberPortalRouter.get(
  '/appointments/:appointmentId',
  validate(barberAppointmentTimeParamsSchema, 'params'),
  getBarberPortalAppointmentHandler,
)
barberPortalRouter.put(
  '/appointments/:appointmentId/status',
  validate(barberAppointmentTimeParamsSchema, 'params'),
  updateBarberPortalAppointmentStatusHandler,
)
barberPortalRouter.get('/earnings', validate(barberPortalQuerySchema, 'query'), listBarberPortalEarningsHandler)
barberPortalRouter.get('/notifications', validate(barberPortalQuerySchema, 'query'), listBarberPortalNotificationsHandler)
barberPortalRouter.put('/notifications/read', validate(barberMarkNotificationReadSchema, 'body'), markBarberNotificationsReadHandler)
barberPortalRouter.get('/availability', getBarberPortalAvailabilityHandler)
barberPortalRouter.put('/availability', validate(barberAvailabilityBodySchema, 'body'), upsertBarberPortalAvailabilityHandler)
