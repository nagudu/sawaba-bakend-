import { Router } from 'express'
import {
  createReviewHandler,
  listReviewsHandler,
  updateReviewHandler,
  deleteReviewHandler,
} from '../controllers/reviewController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { submitLimiter } from '../middleware/rateLimiter'
import {
  createReviewSchema,
  updateReviewSchema,
  listReviewsQuerySchema,
} from '../validators/review'
import { idParamsSchema } from '../validators/appointment'

export const reviewsRouter = Router()

/**
 * @swagger
 * /api/reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: List reviews
 *     description: Public reviews are approved-only; admins may request `approved=false` to review submissions.
 *     parameters:
 *       - in: query
 *         name: approved
 *         schema:
 *           type: string
 *           enum: [true, false, all]
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
 *         description: Paginated list of reviews.
 */
reviewsRouter.get('/', validate(listReviewsQuerySchema, 'query'), (req, res, next) => {
  // Public visitors may only browse APPROVED reviews; any other status filter
  // is an admin listing (PENDING / REJECTED / all) and requires the admin.
  // `barberId` is a PUBLIC filter — barber profiles fetch their approved
  // reviews with it, so it must not require authentication.
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const approved = typeof req.query.approved === 'string' ? req.query.approved : undefined
  const wantsAdminList = status !== undefined || approved === 'false' || approved === 'all'
  if (wantsAdminList) return requireAdmin(req, res, next)
  return next()
}, listReviewsHandler)

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Submit a review (public)
 *     description: Reviews are stored as unapproved and appear publicly only after an admin approves them.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerName, rating, comment]
 *             properties:
 *               customerName:
 *                 type: string
 *               customerImage:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Review submitted (pending approval).
 */
reviewsRouter.post('/', submitLimiter, validate(createReviewSchema), createReviewHandler)

/**
 * @swagger
 * /api/reviews/{id}:
 *   patch:
 *     tags: [Reviews]
 *     summary: Update a review incl. approval (admin)
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
 *               rating:
 *                 type: integer
 *               comment:
 *                 type: string
 *               isApproved:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Review updated.
 */
reviewsRouter.patch(
  '/:id',
  requireAdmin,
  validate(idParamsSchema, 'params'),
  validate(updateReviewSchema),
  updateReviewHandler,
)

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete a review (admin)
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
 *         description: Review deleted.
 */
reviewsRouter.delete('/:id', requireAdmin, validate(idParamsSchema, 'params'), deleteReviewHandler)