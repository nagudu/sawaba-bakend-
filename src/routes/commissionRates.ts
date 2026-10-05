import { Router } from 'express'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import {
  commissionRateHistorySchema,
  commissionRateListSchema,
  commissionRateUpdateSchema,
} from '../validators/commissionRate'
import {
  getCommissionHistoryHandler,
  listCommissionRatesHandler,
  updateCommissionRateHandler,
} from '../controllers/commissionRateController'

export const commissionRatesRouter = Router()

commissionRatesRouter.get('/', requireAdmin, validate(commissionRateListSchema, 'query'), listCommissionRatesHandler)

commissionRatesRouter.get(
  '/:barberId/history',
  requireAdmin,
  validate(commissionRateHistorySchema, 'query'),
  getCommissionHistoryHandler,
)

commissionRatesRouter.put(
  '/:barberId',
  requireAdmin,
  validate(commissionRateUpdateSchema, 'body'),
  updateCommissionRateHandler,
)
