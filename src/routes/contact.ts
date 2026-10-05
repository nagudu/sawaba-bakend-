import { Router } from 'express'
import {
  createContactHandler,
  listContactHandler,
  getContactHandler,
  markContactReadHandler,
  updateContactStatusHandler,
  replyContactHandler,
  deleteContactHandler,
} from '../controllers/contactController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { submitLimiter } from '../middleware/rateLimiter'
import { createContactSchema, listContactQuerySchema } from '../validators/contact'
import { idParamsSchema } from '../validators/appointment'
import { markReadSchema, contactStatusSchema, replySchema } from '../validators/contact'

export const contactRouter = Router()

/**
 * @swagger
 * /api/contact:
 *   post:
 *     tags: [Contact]
 *     summary: Send a contact message (public)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, message]
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent.
 */
contactRouter.post('/', submitLimiter, validate(createContactSchema), createContactHandler)

/**
 * @swagger
 * /api/contact:
 *   get:
 *     tags: [Contact]
 *     summary: List contact messages (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: read
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
 *         description: Paginated messages.
 */
contactRouter.get('/', requireAdmin, validate(listContactQuerySchema, 'query'), listContactHandler)

/**
 * @swagger
 * /api/contact/{id}:
 *   get:
 *     tags: [Contact]
 *     summary: Get a contact message (admin)
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
 *         description: Message details.
 */
contactRouter.get('/:id', requireAdmin, validate(idParamsSchema, 'params'), getContactHandler)

/**
 * @swagger
 * /api/contact/{id}/read:
 *   patch:
 *     tags: [Contact]
 *     summary: Mark a contact message as read/unread (admin)
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
 *             required: [isRead]
 *             properties:
 *               isRead:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Status updated.
 */
contactRouter.patch(
  '/:id/read',
  requireAdmin,
  validate(idParamsSchema, 'params'),
  validate(markReadSchema),
  markContactReadHandler,
)

/**
 * @swagger
 * /api/contact/{id}/status:
 *   patch:
 *     tags: [Contact]
 *     summary: Update a contact message status (admin)
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
 *                 enum: [NEW, READ, REPLIED, ARCHIVED]
 *     responses:
 *       200:
 *         description: Status updated.
 */
contactRouter.patch(
  '/:id/status',
  requireAdmin,
  validate(idParamsSchema, 'params'),
  validate(contactStatusSchema),
  updateContactStatusHandler,
)

/**
 * @swagger
 * /api/contact/{id}/reply:
 *   post:
 *     tags: [Contact]
 *     summary: Reply to a contact message by email (admin)
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
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reply sent and stored.
 */
contactRouter.post(
  '/:id/reply',
  requireAdmin,
  validate(idParamsSchema, 'params'),
  validate(replySchema),
  replyContactHandler,
)

/**
 * @swagger
 * /api/contact/{id}:
 *   delete:
 *     tags: [Contact]
 *     summary: Delete a contact message (admin)
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
 *         description: Message deleted.
 */
contactRouter.delete('/:id', requireAdmin, validate(idParamsSchema, 'params'), deleteContactHandler)