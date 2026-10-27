import { Router } from 'express'
import {
  cancelHandler,
  appointmentsHandler,
  appointmentByIdHandler,
  paymentsHandler,
  summaryHandler,
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

customerMeRouter.post(
  '/appointments/:id/cancel',
  requireCustomer,
  validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
  validate(customerCancelSchema),
  cancelHandler,
)
