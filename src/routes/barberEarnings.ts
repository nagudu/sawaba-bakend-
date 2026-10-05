import { Router } from 'express'
import {
  listEarningsHandler,
  earningsSummaryHandler,
  commissionReportHandler,
  barberPerformanceHandler,
  markEarningPaidHandler,
  assignBarberHandler,
  assignmentHistoryHandler,
} from '../controllers/barberEarningController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { idParamsSchema } from '../validators/appointment'
import {
  earningsQuerySchema,
  markPaidSchema,
  assignBarberSchema,
  assignBarberParamsSchema,
} from '../validators/barberEarning'

/** Every route here is admin-only — commission data never leaks publicly (#22/#23). */
export const barberEarningsRouter = Router()

barberEarningsRouter.use(requireAdmin)

barberEarningsRouter.get('/', validate(earningsQuerySchema, 'query'), listEarningsHandler)
barberEarningsRouter.get('/summary', validate(earningsQuerySchema, 'query'), earningsSummaryHandler)
barberEarningsRouter.get('/report', validate(earningsQuerySchema, 'query'), commissionReportHandler)
barberEarningsRouter.get('/performance', validate(earningsQuerySchema, 'query'), barberPerformanceHandler)
barberEarningsRouter.post('/:id/paid', validate(idParamsSchema, 'params'), validate(markPaidSchema), markEarningPaidHandler)

/** Appointment assignment endpoints (mounted under /api/admin/barber-earnings for cohesion). */
export const assignmentRouter = Router()

assignmentRouter.use(requireAdmin)
assignmentRouter.put('/:id/assign-barber', validate(assignBarberParamsSchema, 'params'), validate(assignBarberSchema), assignBarberHandler)
assignmentRouter.get('/:id/assignment-history', validate(assignBarberParamsSchema, 'params'), assignmentHistoryHandler)
