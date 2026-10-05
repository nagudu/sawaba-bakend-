"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availabilityRouter = void 0;
const express_1 = require("express");
const availabilityController_1 = require("../controllers/availabilityController");
const validate_1 = require("../middleware/validate");
const appointment_1 = require("../validators/appointment");
exports.availabilityRouter = (0, express_1.Router)();
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
exports.availabilityRouter.get('/', (0, validate_1.validate)(appointment_1.availabilityQuerySchema, 'query'), availabilityController_1.getAvailabilityHandler);
//# sourceMappingURL=availability.js.map