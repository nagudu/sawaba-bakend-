import { Router } from 'express'
import {
  createBarberHandler,
  listBarbersHandler,
  getBarberByIdHandler,
  updateBarberHandler,
  deleteBarberHandler,
  getAvailabilityHandler,
  setAvailabilityHandler,
} from '../controllers/barberController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { upload } from '../utils/upload'
import {
  createBarberSchema,
  updateBarberSchema,
  barberIdParamsSchema,
  availabilityParamsSchema,
  setAvailabilityBulkSchema,
  listBarbersQuerySchema,
} from '../validators/barber'

export const barbersRouter = Router()

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
barbersRouter.get('/', validate(listBarbersQuerySchema, 'query'), listBarbersHandler)

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
barbersRouter.post(
  '/',
  requireAdmin,
  upload.single('image'),
  validate(createBarberSchema),
  createBarberHandler,
)

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
barbersRouter.get(
  '/:id/availability',
  validate(availabilityParamsSchema, 'params'),
  getAvailabilityHandler,
)

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
barbersRouter.put(
  '/:id/availability',
  requireAdmin,
  validate(availabilityParamsSchema, 'params'),
  validate(setAvailabilityBulkSchema),
  setAvailabilityHandler,
)

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
barbersRouter.get('/:id', validate(barberIdParamsSchema, 'params'), getBarberByIdHandler)

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
barbersRouter.put(
  '/:id',
  requireAdmin,
  upload.single('image'),
  validate(barberIdParamsSchema, 'params'),
  validate(updateBarberSchema),
  updateBarberHandler,
)

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
barbersRouter.delete('/:id', requireAdmin, validate(barberIdParamsSchema, 'params'), deleteBarberHandler)