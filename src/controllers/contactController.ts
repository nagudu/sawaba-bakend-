import type { Request, Response, NextFunction } from 'express'
import {
  createContactMessage,
  listContactMessages,
  getContactThread,
  markContactRead,
  updateContactStatus,
  deleteContactMessage,
  sendContactReply,
  type ContactStatus,
} from '../services/contactService'
import { successRes } from '../utils/response'
import type { CreateContactInput } from '../validators/contact'

export async function createContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CreateContactInput
    const message = await createContactMessage(input)
    successRes(res, 'Message sent successfully. We will get back to you shortly.', message, 201)
  } catch (error) {
    next(error)
  }
}

export async function listContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as Record<string, unknown>
    const result = await listContactMessages(query)
    successRes(res, 'Contact messages retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function getContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const message = await getContactThread(Number(req.params.id))
    successRes(res, 'Contact message retrieved.', message, 200)
  } catch (error) {
    next(error)
  }
}

export async function markContactReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const isRead = Boolean(req.body.isRead ?? true)
    const message = await markContactRead(Number(req.params.id), isRead)
    successRes(res, 'Contact message status updated.', message, 200)
  } catch (error) {
    next(error)
  }
}

export async function updateContactStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = req.body as { status: ContactStatus }
    const message = await updateContactStatus(Number(req.params.id), status)
    successRes(res, 'Contact message status updated.', message, 200)
  } catch (error) {
    next(error)
  }
}

export async function replyContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message } = req.body as { message: string }
    const admin = req.admin!
    const result = await sendContactReply({
      contactMessageId: Number(req.params.id),
      adminId: admin.id,
      adminName: admin.name,
      message,
    })
    successRes(res, 'Reply sent successfully.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function deleteContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteContactMessage(Number(req.params.id))
    successRes(res, 'Contact message deleted successfully.', {}, 200)
  } catch (error) {
    next(error)
  }
}
