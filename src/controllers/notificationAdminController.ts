import type { NextFunction, Request, Response } from 'express'
import {
  getNotificationSettingsAdmin,
  listCustomerNotifications,
  listNotificationTemplates,
  sendTestNotification,
  updateNotificationSettingsAdmin,
  upsertNotificationTemplate,
} from '../services/notificationAdminService'
import { successRes } from '../utils/response'
import { retryCustomerNotification } from '../services/notificationService'
import { notificationHistoryQuerySchema, notificationTemplateSchema } from '../validators/notification'

export async function getNotificationSettingsAdminHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await getNotificationSettingsAdmin()
    successRes(res, 'Notification settings retrieved.', settings, 200)
  } catch (error) {
    next(error)
  }
}

export async function updateNotificationSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await updateNotificationSettingsAdmin(req.body as Record<string, unknown>)
    successRes(res, 'Notification settings updated successfully.', settings, 200)
  } catch (error) {
    next(error)
  }
}

export async function listNotificationTemplatesHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const templates = await listNotificationTemplates()
    successRes(res, 'Notification templates retrieved.', templates, 200)
  } catch (error) {
    next(error)
  }
}

export async function upsertNotificationTemplateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = notificationTemplateSchema.parse(req.body)
    await upsertNotificationTemplate({
      name: input.name,
      event: input.event,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      isActive: input.isActive,
    })
    successRes(res, 'Notification template saved.', { ok: true }, 200)
  } catch (error) {
    next(error)
  }
}

export async function listNotificationHistoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = notificationHistoryQuerySchema.parse(req.query)
    const result = await listCustomerNotifications({
      status: query.status,
      channel: query.channel,
      event: query.event,
      customerId: query.customerId,
      page: query.page,
      perPage: query.perPage,
    })
    successRes(res, 'Notification history retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function retryNotificationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number((req.params as Record<string, string>).id)
    const result = await retryCustomerNotification(id)
    successRes(res, 'Notification retried.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function sendNotificationTestHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as { channel?: string; customerId?: number | null }
    const result = await sendTestNotification({ channel: input.channel as never, customerId: input.customerId ?? null })
    successRes(res, 'Test notification dispatched.', result, 200)
  } catch (error) {
    next(error)
  }
}
