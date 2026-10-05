import { Router } from 'express'
import {
  createAppointmentHandler,
  listAppointmentsHandler,
  getAppointmentByIdHandler,
  updateAppointmentHandler,
  updateAppointmentStatusHandler,
  reactivateAppointmentHandler,
  deleteAppointmentHandler,
} from '../controllers/appointmentController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { submitLimiter } from '../middleware/rateLimiter'
import { upload } from '../utils/upload'
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  appointmentStatusSchema,
  idParamsSchema,
  listAppointmentsQuerySchema,
} from '../validators/appointment'

export const appointmentsRouter = Router()

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
appointmentsRouter.post(
  '/',
  submitLimiter,
  upload.single('receipt'),
  validate(createAppointmentSchema),
  createAppointmentHandler,
)

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
appointmentsRouter.get(
  '/',
  requireAdmin,
  validate(listAppointmentsQuerySchema, 'query'),
  listAppointmentsHandler,
)

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
appointmentsRouter.get('/:id', requireAdmin, validate(idParamsSchema, 'params'), getAppointmentByIdHandler)

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
appointmentsRouter.patch(
  '/:id',
  requireAdmin,
  validate(idParamsSchema, 'params'),
  validate(updateAppointmentSchema),
  updateAppointmentHandler,
)

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
appointmentsRouter.post(
  '/:id/reactivate',
  requireAdmin,
  validate(idParamsSchema, 'params'),
  reactivateAppointmentHandler,
)

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
appointmentsRouter.patch(
  '/:id/status',
  requireAdmin,
  validate(idParamsSchema, 'params'),
  validate(appointmentStatusSchema),
  updateAppointmentStatusHandler,
)

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
appointmentsRouter.delete('/:id', requireAdmin, validate(idParamsSchema, 'params'), deleteAppointmentHandler)