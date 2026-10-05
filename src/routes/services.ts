import { Router } from 'express'
import {
  createServiceHandler,
  listServicesHandler,
  getServiceByIdHandler,
  updateServiceHandler,
  deleteServiceHandler,
} from '../controllers/serviceController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { upload } from '../utils/upload'
import {
  createServiceSchema,
  updateServiceSchema,
  serviceIdParamsSchema,
  listServicesQuerySchema,
} from '../validators/service'

export const servicesRouter = Router()

/**
 * @swagger
 * /api/services:
 *   get:
 *     tags: [Services]
 *     summary: List services
 *     description: Public endpoint returning active services (paginated).
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by service category.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated list of services.
 */
servicesRouter.get('/', validate(listServicesQuerySchema, 'query'), listServicesHandler)

/**
 * @swagger
 * /api/services:
 *   post:
 *     tags: [Services]
 *     summary: Create a service
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
 *               - price
 *               - duration
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               duration:
 *                 type: integer
 *                 description: Duration in minutes.
 *               category:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Service created.
 */
servicesRouter.post(
  '/',
  requireAdmin,
  upload.single('image'),
  validate(createServiceSchema),
  createServiceHandler,
)

/**
 * @swagger
 * /api/services/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Get a single service
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Service details.
 */
servicesRouter.get('/:id', validate(serviceIdParamsSchema, 'params'), getServiceByIdHandler)

/**
 * @swagger
 * /api/services/{id}:
 *   put:
 *     tags: [Services]
 *     summary: Update a service
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
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               duration:
 *                 type: integer
 *               category:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Service updated.
 */
servicesRouter.put(
  '/:id',
  requireAdmin,
  upload.single('image'),
  validate(serviceIdParamsSchema, 'params'),
  validate(updateServiceSchema),
  updateServiceHandler,
)

/**
 * @swagger
 * /api/services/{id}:
 *   delete:
 *     tags: [Services]
 *     summary: Delete a service
 *     description: Admin only. Fails if the service has appointments.
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
 *         description: Service deleted.
 */
servicesRouter.delete('/:id', requireAdmin, validate(serviceIdParamsSchema, 'params'), deleteServiceHandler)