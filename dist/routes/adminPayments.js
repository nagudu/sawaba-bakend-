"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminPaymentsRouter = void 0;
const express_1 = require("express");
const paymentController_1 = require("../controllers/paymentController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const payment_1 = require("../validators/payment");
exports.adminPaymentsRouter = (0, express_1.Router)();
exports.adminPaymentsRouter.use(auth_1.requireAdmin);
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
exports.adminPaymentsRouter.get('/', (0, validate_1.validate)(payment_1.listPaymentsQuerySchema, 'query'), paymentController_1.listPaymentsHandler);
/**
 * @swagger
 * /api/admin/payments/{id}:
 *   get:
 *     tags: [Payments]
 *     summary: Get a payment (admin)
 *     security:
 *       - bearerAuth: []
 */
exports.adminPaymentsRouter.get('/:id', (0, validate_1.validate)(payment_1.paymentIdParamsSchema, 'params'), paymentController_1.getPaymentByIdHandler);
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
exports.adminPaymentsRouter.post('/:id/verify', (0, validate_1.validate)(payment_1.paymentIdParamsSchema, 'params'), paymentController_1.verifyPaymentHandler);
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
exports.adminPaymentsRouter.post('/:id/reject', (0, validate_1.validate)(payment_1.paymentIdParamsSchema, 'params'), (0, validate_1.validate)(payment_1.rejectPaymentSchema), paymentController_1.rejectPaymentHandler);
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
exports.adminPaymentsRouter.post('/:id/confirm-cash', (0, validate_1.validate)(payment_1.paymentIdParamsSchema, 'params'), (0, validate_1.validate)(payment_1.cashConfirmSchema), paymentController_1.confirmCashHandler);
//# sourceMappingURL=adminPayments.js.map