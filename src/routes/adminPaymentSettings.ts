import { Router } from 'express'
import {
  getPaymentSettingsAdminHandler,
  updatePaymentSettingsHandler,
} from '../controllers/paymentSettingsController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { updatePaymentSettingsSchema } from '../validators/paymentSettings'

export const adminPaymentSettingsRouter = Router()

adminPaymentSettingsRouter.use(requireAdmin)

/**
 * @swagger
 * /api/admin/payment-settings:
 *   get:
 *     tags: [PaymentSettings]
 *     summary: Get payment settings (admin)
 *     security:
 *       - bearerAuth: []
 */
adminPaymentSettingsRouter.get('/', getPaymentSettingsAdminHandler)

/**
 * @swagger
 * /api/admin/payment-settings:
 *   put:
 *     tags: [PaymentSettings]
 *     summary: Update payment settings (admin)
 *     security:
 *       - bearerAuth: []
 */
adminPaymentSettingsRouter.put(
  '/',
  validate(updatePaymentSettingsSchema),
  updatePaymentSettingsHandler,
)