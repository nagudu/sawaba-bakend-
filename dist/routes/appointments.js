"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appointmentsRouter = void 0;
const express_1 = require("express");
const appointmentController_1 = require("../controllers/appointmentController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const upload_1 = require("../utils/upload");
const appointment_1 = require("../validators/appointment");
exports.appointmentsRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/appointments:
 *   post:
 *     tags: [Appointments]
 *     summary: Create a booking request (public)
 *     description: Validates date, time, service and barber availability, prevents past and duplicate bookings, and upserts the customer record.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerName
 *               - customerPhone
 *               - serviceId
 *               - barberId
 *               - appointmentDate
 *               - appointmentTime
 *             properties:
 *               customerName:
 *                 type: string
 *               customerPhone:
 *                 type: string
 *               customerEmail:
 *                 type: string
 *                 format: email
 *               serviceId:
 *                 type: integer
 *               barberId:
 *                 type: integer
 *               appointmentDate:
 *                 type: string
 *                 format: date
 *                 example: '2026-09-20'
 *               appointmentTime:
 *                 type: string
 *                 example: '14:30'
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Appointment request created.
 *       409:
 *         description: Time slot already taken.
 *       422:
 *         description: Validation failed (past date, unavailable barber, etc).
 */
/**
 * Multipart so a BANK_TRANSFER/OPAY booking can carry its receipt in the same
 * request — a transfer booking without a receipt is rejected (see service).
 */
exports.appointmentsRouter.post('/', rateLimiter_1.submitLimiter, upload_1.upload.single('receipt'), (0, validate_1.validate)(appointment_1.createAppointmentSchema), appointmentController_1.createAppointmentHandler);
/**
 * @swagger
 * /api/appointments:
 *   get:
 *     tags: [Appointments]
 *     summary: List appointments (admin)
 *     description: Filter by status, barber, service and date range.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [PAYMENT_REQUIRED, PAYMENT_SUBMITTED, PAYMENT_VERIFIED, PAYMENT_REJECTED, READY_FOR_SERVICE, IN_PROGRESS, COMPLETED, CANCELLED]
 *       - in: query
 *         name: barberId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: serviceId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated list of appointments.
 */
exports.appointmentsRouter.get('/', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.listAppointmentsQuerySchema, 'query'), appointmentController_1.listAppointmentsHandler);
/**
 * @swagger
 * /api/appointments/{id}:
 *   get:
 *     tags: [Appointments]
 *     summary: Get an appointment (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Appointment details.
 */
exports.appointmentsRouter.get('/:id', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), appointmentController_1.getAppointmentByIdHandler);
/**
 * @swagger
 * /api/appointments/{id}:
 *   patch:
 *     tags: [Appointments]
 *     summary: Update an appointment (admin)
 *     description: Re-validates availability whenever date, time, barber or service changes.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerName:
 *                 type: string
 *               customerPhone:
 *                 type: string
 *               customerEmail:
 *                 type: string
 *               serviceId:
 *                 type: integer
 *               barberId:
 *                 type: integer
 *               appointmentDate:
 *                 type: string
 *                 format: date
 *               appointmentTime:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Appointment updated.
 */
exports.appointmentsRouter.patch('/:id', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), (0, validate_1.validate)(appointment_1.updateAppointmentSchema), appointmentController_1.updateAppointmentHandler);
/**
 * @swagger
 * /api/appointments/{id}/reactivate:
 *   post:
 *     tags: [Appointments]
 *     summary: Reactivate a cancelled appointment (admin)
 *     description: Returns a cancelled appointment to PAYMENT_REQUIRED (or READY_FOR_SERVICE if its payment was already verified).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Appointment reactivated.
 */
exports.appointmentsRouter.post('/:id/reactivate', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), appointmentController_1.reactivateAppointmentHandler);
/**
 * @swagger
 * /api/appointments/{id}/status:
 *   patch:
 *     tags: [Appointments]
 *     summary: Update appointment status (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PAYMENT_REQUIRED, PAYMENT_SUBMITTED, PAYMENT_VERIFIED, PAYMENT_REJECTED, READY_FOR_SERVICE, IN_PROGRESS, COMPLETED, CANCELLED]
 *     responses:
 *       200:
 *         description: Status updated.
 */
exports.appointmentsRouter.patch('/:id/status', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), (0, validate_1.validate)(appointment_1.appointmentStatusSchema), appointmentController_1.updateAppointmentStatusHandler);
/**
 * @swagger
 * /api/appointments/{id}:
 *   delete:
 *     tags: [Appointments]
 *     summary: Delete or cancel an appointment (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Appointment deleted.
 */
exports.appointmentsRouter.delete('/:id', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), appointmentController_1.deleteAppointmentHandler);
//# sourceMappingURL=appointments.js.map