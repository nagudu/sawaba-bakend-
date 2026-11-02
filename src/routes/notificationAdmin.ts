import { Router } from 'express'
import { z } from 'zod'
import {
  getNotificationSettingsAdminHandler,
  listNotificationHistoryHandler,
  listNotificationTemplatesHandler,
  retryNotificationHandler,
  sendNotificationTestHandler,
  updateNotificationSettingsHandler,
  upsertNotificationTemplateHandler,
} from '../controllers/notificationAdminController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { notificationHistoryQuerySchema, notificationSettingsSchema, notificationTemplateSchema } from '../validators/notification'

export const notificationAdminRouter = Router()

notificationAdminRouter.use(requireAdmin)

/**
 * @swagger
 * /api/admin/notifications/settings:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notification settings (admin)
 *     security:
 *       - bearerAuth: []
 */
notificationAdminRouter.get('/settings', getNotificationSettingsAdminHandler)

/**
 * @swagger
 * /api/admin/notifications/settings:
 *   put:
 *     tags: [Notifications]
 *     summary: Update notification settings (admin)
 *     security:
 *       - bearerAuth: []
 */
notificationAdminRouter.put('/settings', validate(notificationSettingsSchema), updateNotificationSettingsHandler)

notificationAdminRouter.get('/templates', listNotificationTemplatesHandler)

notificationAdminRouter.put('/templates', validate(notificationTemplateSchema), upsertNotificationTemplateHandler)

notificationAdminRouter.get(
  '/history',
  validate(notificationHistoryQuerySchema, 'query'),
  listNotificationHistoryHandler,
)

notificationAdminRouter.post(
  '/test',
  validate(
    z.object({
      channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
      customerId: z.coerce.number().int().positive().optional().nullable(),
    }),
  ),
  sendNotificationTestHandler,
)

notificationAdminRouter.post('/:id/retry', retryNotificationHandler)
