import { Router } from 'express'
import {
  createGalleryHandler,
  listGalleryHandler,
  getGalleryByIdHandler,
  updateGalleryHandler,
  deleteGalleryHandler,
} from '../controllers/galleryController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { upload } from '../utils/upload'
import {
  createGallerySchema,
  updateGallerySchema,
  listGalleryQuerySchema,
} from '../validators/gallery'
import { idParamsSchema } from '../validators/appointment'

export const galleryRouter = Router()

/**
 * @swagger
 * /api/gallery:
 *   get:
 *     tags: [Gallery]
 *     summary: List gallery images
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [HAIRCUT, FADE, BEARD, STYLING, KIDS, SALON]
 *       - in: query
 *         name: barberId
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
 *         description: Paginated gallery items.
 */
galleryRouter.get('/', validate(listGalleryQuerySchema, 'query'), listGalleryHandler)

/**
 * @swagger
 * /api/gallery:
 *   post:
 *     tags: [Gallery]
 *     summary: Add a gallery image (admin)
 *     description: Accepts multipart/form-data with an image file, or JSON with an image URL.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - image
 *             properties:
 *               title:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [HAIRCUT, FADE, BEARD, STYLING, KIDS, SALON]
 *               barberId:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Gallery item created.
 */
galleryRouter.post(
  '/',
  requireAdmin,
  upload.single('image'),
  validate(createGallerySchema),
  createGalleryHandler,
)

/**
 * @swagger
 * /api/gallery/{id}:
 *   get:
 *     tags: [Gallery]
 *     summary: Get a gallery item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Gallery item details.
 */
galleryRouter.get('/:id', validate(idParamsSchema, 'params'), getGalleryByIdHandler)

/**
 * @swagger
 * /api/gallery/{id}:
 *   put:
 *     tags: [Gallery]
 *     summary: Update a gallery item (admin)
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
 *               title:
 *                 type: string
 *               category:
 *                 type: string
 *               barberId:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Gallery item updated.
 */
galleryRouter.put(
  '/:id',
  requireAdmin,
  upload.single('image'),
  validate(idParamsSchema, 'params'),
  validate(updateGallerySchema),
  updateGalleryHandler,
)

/**
 * @swagger
 * /api/gallery/{id}:
 *   delete:
 *     tags: [Gallery]
 *     summary: Delete a gallery item (admin)
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
 *         description: Gallery item deleted.
 */
galleryRouter.delete('/:id', requireAdmin, validate(idParamsSchema, 'params'), deleteGalleryHandler)