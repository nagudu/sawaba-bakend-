import { Router } from 'express'
import {
  appointmentByIdHandler,
  appointmentsHandler,
  cancelHandler,
  paymentsHandler,
  summaryHandler,
} from '../controllers/customerMeController'
import { requireCustomer } from '../middleware/customerAuth'
import { validate } from '../middleware/validate'
import { customerCancelSchema } from '../validators/customerAuth'
import { z } from 'zod'

export const customerMeRouter = Router()

customerMeRouter.get('/summary', requireCustomer, summaryHandler)
customerMeRouter.get('/appointments', requireCustomer, appointmentsHandler)
customerMeRouter.get('/appointments/:id', requireCustomer, validate(z.object({ id: z.coerce.number().int().positive() }), 'params'), appointmentByIdHandler)
customerMeRouter.get('/payments', requireCustomer, paymentsHandler)

customerMeRouter.post(
  '/appointments/:id/cancel',
  requireCustomer,
  validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
  validate(customerCancelSchema),
  cancelHandler,
)
