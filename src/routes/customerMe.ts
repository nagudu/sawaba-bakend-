import { Router } from 'express'
import {
  cancelHandler,
  appointmentsHandler,
  appointmentByIdHandler,
  paymentsHandler,
  summaryHandler,
  notificationsHandler,
  unreadNotificationCountHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
} from '../controllers/customerMeController'
import { getCustomerAppointmentQrHandler } from '../controllers/qrController'
import { requireCustomer } from '../middleware/customerAuth'
import { validate } from '../middleware/validate'
import { customerCancelSchema } from '../validators/customerAuth'
import { z } from 'zod'

export const customerMeRouter = Router()

customerMeRouter.get('/summary', requireCustomer, summaryHandler)
customerMeRouter.get('/appointments', requireCustomer, appointmentsHandler)
customerMeRouter.get('/appointments/:id', requireCustomer, validate(z.object({ id: z.coerce.number().int().positive() }), 'params'), appointmentByIdHandler)
customerMeRouter.get(
  '/appointments/:id/qr',
  requireCustomer,
  validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
  getCustomerAppointmentQrHandler,
)
customerMeRouter.get('/payments', requireCustomer, paymentsHandler)

const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(50).optional(),
  unread: z.enum(['true', 'false']).optional(),
})

// In-app notification center + unread badge.
customerMeRouter.get('/notifications', requireCustomer, validate(notificationQuerySchema, 'query'), notificationsHandler)
customerMeRouter.get('/notifications/unread-count', requireCustomer, unreadNotificationCountHandler)
customerMeRouter.post('/notifications/read-all', requireCustomer, markAllNotificationsReadHandler)
customerMeRouter.post(
  '/notifications/:id/read',
  requireCustomer,
  validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
  markNotificationReadHandler,
)

customerMeRouter.post(
  '/appointments/:id/cancel',
  requireCustomer,
  validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
  validate(customerCancelSchema),
  cancelHandler,
)
