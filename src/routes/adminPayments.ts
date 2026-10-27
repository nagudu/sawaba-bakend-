import { Router } from 'express'
import {
  confirmCashHandler,
  exportPaymentsHandler,
  getPaymentByIdHandler,
  getPaymentSummaryHandler,
  listPaymentsHandler,
  refundPaymentHandler,
  rejectPaymentHandler,
  verifyPaymentHandler,
} from '../controllers/paymentController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import {
  cashConfirmSchema,
  listPaymentsQuerySchema,
  paymentIdParamsSchema,
  refundPaymentSchema,
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
 * /api/admin/payments/summary:
 *   get:
 *     tags: [Payments]
 *     summary: Aggregated transaction totals (admin)
 *     description: Successful / pending / today revenue totals. Revenue counts verified PAID payments only. Optional from, to and method scope the figures.
 *     security:
 *       - bearerAuth: []
 */
// Mounted before /:id so "summary" is never captured as a payment id.
adminPaymentsRouter.get(
  '/summary',
  validate(listPaymentsQuerySchema, 'query'),
  getPaymentSummaryHandler,
)

/**
 * @swagger
 * /api/admin/payments/export:
 *   get:
 *     tags: [Payments]
 *     summary: Export transactions as CSV (admin)
 *     description: Uses the same filters as the list endpoint; returns a CSV attachment for accounting.
 *     security:
 *       - bearerAuth: []
 */
adminPaymentsRouter.get(
  '/export',
  validate(listPaymentsQuerySchema, 'query'),
  exportPaymentsHandler,
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
 * /api/admin/payments/{id}/refund:
 *   post:
 *     tags: [Payments]
 *     summary: Mark a verified payment as refunded (admin)
 *     description: Only PAID payments can be refunded. Requires a reason. Unsettled barber commission is unwound.
 *     security:
 *       - bearerAuth: []
 */
adminPaymentsRouter.post(
  '/:id/refund',
  validate(paymentIdParamsSchema, 'params'),
  validate(refundPaymentSchema),
  refundPaymentHandler,
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