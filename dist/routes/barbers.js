"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.barbersRouter = void 0;
const express_1 = require("express");
const barberController_1 = require("../controllers/barberController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const upload_1 = require("../utils/upload");
const barber_1 = require("../validators/barber");
exports.barbersRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/barbers:
 *   get:
 *     tags: [Barbers]
 *     summary: List barbers
 *     parameters:
 *       - in: query
 *         name: serviceId
 *         schema:
 *           type: integer
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
 *         description: Paginated list of barbers.
 */
exports.barbersRouter.get('/', (0, validate_1.validate)(barber_1.listBarbersQuerySchema, 'query'), barberController_1.listBarbersHandler);
/**
 * @swagger
 * /api/barbers:
 *   post:
 *     tags: [Barbers]
 *     summary: Create a barber
 *     description: Admin only. Accepts JSON or multipart/form-data with an optional image file.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               specialty:
 *                 type: string
 *               biography:
 *                 type: string
 *               experience:
 *                 type: integer
 *               rating:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *               serviceIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Comma/newline separated for form uploads.
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Barber created.
 */
exports.barbersRouter.post('/', auth_1.requireAdmin, upload_1.upload.single('image'), (0, validate_1.validate)(barber_1.createBarberSchema), barberController_1.createBarberHandler);
/**
 * @swagger
 * /api/barbers/{id}/availability:
 *   get:
 *     tags: [Barbers]
 *     summary: Get a barber's weekly availability schedule
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Weekly availability entries.
 */
exports.barbersRouter.get('/:id/availability', (0, validate_1.validate)(barber_1.availabilityParamsSchema, 'params'), barberController_1.getAvailabilityHandler);
/**
 * @swagger
 * /api/barbers/{id}/availability:
 *   put:
 *     tags: [Barbers]
 *     summary: Set a barber's availability schedule
 *     description: Admin only. Accepts a single entry or an array of entries.
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
 *             type: array
 *             items:
 *               type: object
 *               required: [dayOfWeek, startTime, endTime]
 *               properties:
 *                 dayOfWeek:
 *                   type: integer
 *                   minimum: 0
 *                   maximum: 6
 *                 startTime:
 *                   type: string
 *                   example: '09:00'
 *                 endTime:
 *                   type: string
 *                   example: '18:00'
 *                 isAvailable:
 *                   type: boolean
 *     responses:
 *       200:
 *         description: Availability updated.
 */
exports.barbersRouter.put('/:id/availability', auth_1.requireAdmin, (0, validate_1.validate)(barber_1.availabilityParamsSchema, 'params'), (0, validate_1.validate)(barber_1.setAvailabilityBulkSchema), barberController_1.setAvailabilityHandler);
/**
 * @swagger
 * /api/barbers/{id}:
 *   get:
 *     tags: [Barbers]
 *     summary: Get a single barber with their services
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Barber details.
 */
exports.barbersRouter.get('/:id', (0, validate_1.validate)(barber_1.barberIdParamsSchema, 'params'), barberController_1.getBarberByIdHandler);
/**
 * @swagger
 * /api/barbers/{id}:
 *   put:
 *     tags: [Barbers]
 *     summary: Update a barber
 *     description: Admin only. Accepts JSON or multipart/form-data with an optional image file.
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               specialty:
 *                 type: string
 *               biography:
 *                 type: string
 *               experience:
 *                 type: integer
 *               rating:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Barber updated.
 */
exports.barbersRouter.put('/:id', auth_1.requireAdmin, upload_1.upload.single('image'), (0, validate_1.validate)(barber_1.barberIdParamsSchema, 'params'), (0, validate_1.validate)(barber_1.updateBarberSchema), barberController_1.updateBarberHandler);
/**
 * @swagger
 * /api/barbers/{id}:
 *   delete:
 *     tags: [Barbers]
 *     summary: Delete a barber
 *     description: Admin only.
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
 *         description: Barber deleted.
 */
exports.barbersRouter.delete('/:id', auth_1.requireAdmin, (0, validate_1.validate)(barber_1.barberIdParamsSchema, 'params'), barberController_1.deleteBarberHandler);
//# sourceMappingURL=barbers.js.map