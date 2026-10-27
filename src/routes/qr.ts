import { Router } from 'express'
import { requireAdmin } from '../middleware/auth'
import { requireBarber } from '../middleware/barberAuth'
import { validate } from '../middleware/validate'
import { qrScanLimiter } from '../middleware/rateLimiter'
import {
  adminCheckInQrHandler,
  adminValidateQrHandler,
  appointmentQrHistoryHandler,
  checkInQrHandler,
  listQrActivityHandler,
  regenerateQrHandler,
  revokeQrHandler,
  validateQrHandler,
} from '../controllers/qrController'
import {
  qrActivityQuerySchema,
  qrAppointmentBodySchema,
  qrAppointmentIdParamsSchema,
  qrCheckinBodySchema,
  qrValidateBodySchema,
} from '../validators/qr'

/**
 * Barber scanner endpoints — mounted at /api/barber/portal/qr. Every route is
 * scoped to the authenticated barber (the server derives the barber id from the
 * token; the client never sends it).
 */
export const barberQrRouter = Router()

barberQrRouter.use(requireBarber)
barberQrRouter.use(qrScanLimiter)

barberQrRouter.post('/validate', validate(qrValidateBodySchema), validateQrHandler)
barberQrRouter.post('/checkin', validate(qrCheckinBodySchema), checkInQrHandler)

/**
 * Admin QR tools — mounted at /api/admin/qr. The scanner can validate/inspect
 * any booking and check a customer in, but never mutates payment status: that
 * stays on the dedicated /api/admin/payments/:id/verify workflow.
 */
export const adminQrRouter = Router()

adminQrRouter.use(requireAdmin)
adminQrRouter.use(qrScanLimiter)

adminQrRouter.post('/validate', validate(qrValidateBodySchema), adminValidateQrHandler)
adminQrRouter.post('/checkin', validate(qrCheckinBodySchema), adminCheckInQrHandler)
adminQrRouter.get(
  '/appointments/:id/history',
  validate(qrAppointmentIdParamsSchema, 'params'),
  appointmentQrHistoryHandler,
)
adminQrRouter.get('/activity', validate(qrActivityQuerySchema, 'query'), listQrActivityHandler)
adminQrRouter.post('/regenerate', validate(qrAppointmentBodySchema), regenerateQrHandler)
adminQrRouter.post('/revoke', validate(qrAppointmentBodySchema), revokeQrHandler)
