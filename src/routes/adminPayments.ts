import { Router } from 'express'
import {
  confirmCashHandler,
  getPaymentByIdHandler,
  listPaymentsHandler,
  rejectPaymentHandler,
  verifyPaymentHandler,
} from '../controllers/paymentController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import {
  cashConfirmSchema,
  listPaymentsQuerySchema,
  paymentIdParamsSchema,
  rejectPaymentSchema,
} from '../validators/payment'

export const adminPaymentsRouter = Router()

adminPaymentsRouter.use(requireAdmin)

/**
 * @swagger
 * /api/admin/payments:
 *   get:
 *     tags: [Payments]
 *     summary: List payments (admin)
 *     description: Filter by status, method and date range, with optional search on customer name / phone / appointment id.
 *     security:
 *       - bearerAuth: []
 */
adminPaymentsRouter.get(
  '/',
  validate(listPaymentsQuerySchema, 'query'),
  listPaymentsHandler,
)

/**
 * @swagger
 * /api/admin/payments/{id}:
 *   get:
 *     tags: [Payments]
 *     summary: Get a payment (admin)
 *     security:
 *       - bearerAuth: []
 */
adminPaymentsRouter.get('/:id', validate(paymentIdParamsSchema, 'params'), getPaymentByIdHandler)

/**
 * @swagger
 * /api/admin/payments/{id}/verify:
 *   post:
 *     tags: [Payments]
 *     summary: Verify a submitted payment (admin)
 *     description: Marks the payment PAID and moves the appointment to READY_FOR_SERVICE.
 *     security:
 *       - bearerAuth: []
 */
adminPaymentsRouter.post(
  '/:id/verify',
  validate(paymentIdParamsSchema, 'params'),
  verifyPaymentHandler,
)

/**
 * @swagger
 * /api/admin/payments/{id}/reject:
 *   post:
 *     tags: [Payments]
 *     summary: Reject a submitted payment (admin)
     *     description: Requires a reason. Sets the appointment to PAYMENT_REJECTED so the customer can retry.
 *     security:
 *       - bearerAuth: []
 */
adminPaymentsRouter.post(
  '/:id/reject',
  validate(paymentIdParamsSchema, 'params'),
  validate(rejectPaymentSchema),
  rejectPaymentHandler,
)

/**
 * @swagger
 * /api/admin/payments/{id}/confirm-cash:
 *   post:
 *     tags: [Payments]
 *     summary: Confirm cash received at the salon (admin)
 *     description: CASH-only. Marks the payment PAID with an audit trail — no receipt involved.
 *     security:
 *       - bearerAuth: []
 */
adminPaymentsRouter.post(
  '/:id/confirm-cash',
  validate(paymentIdParamsSchema, 'params'),
  validate(cashConfirmSchema),
  confirmCashHandler,
)