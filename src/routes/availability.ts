import { Router } from 'express'
import { getAvailabilityHandler } from '../controllers/availabilityController'
import { validate } from '../middleware/validate'
import { availabilityQuerySchema } from '../validators/appointment'

export const availabilityRouter = Router()

/**
 * @swagger
 * /api/availability:
 *   get:
 *     tags: [Availability]
 *     summary: Get available time slots for a barber on a date
 *     description: Returns slots that fit the service duration and are not already booked. `duration` defaults to 30 minutes; pass `serviceId` to use that service's duration.
 *     parameters:
 *       - in: query
 *         name: barberId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: '2026-09-20'
 *       - in: query
 *         name: serviceId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: duration
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Available time slots.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 barberId:
 *                   type: integer
 *                 date:
 *                   type: string
 *                 duration:
 *                   type: integer
 *                 slots:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       time:
 *                         type: string
 *                       endTime:
 *                         type: string
 *                       available:
 *                         type: boolean
 */
availabilityRouter.get('/', validate(availabilityQuerySchema, 'query'), getAvailabilityHandler)