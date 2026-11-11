import type { NextFunction, Request, Response } from 'express'
import {
  cancelOwnAppointment,
  getCustomerAppointmentById,
  getCustomerAppointments,
  getCustomerPayments,
  getCustomerSummary,
} from '../services/customerMeService'
import {
  getCustomerUnreadCount,
  listCustomerNotifications,
  markAllCustomerNotificationsRead,
  markCustomerNotificationRead,
} from '../services/customerNotificationService'
import { successRes } from '../utils/response'

export async function summaryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await getCustomerSummary(req.customer!)
    successRes(res, 'Dashboard summary retrieved.', summary, 200)
  } catch (error) {
    next(error)
  }
}

export async function appointmentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await getCustomerAppointments(req.customer!, {
      page: Number(req.query.page) || undefined,
      perPage: Number(req.query.perPage) || undefined,
    })
    successRes(res, 'Booking history retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function paymentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await getCustomerPayments(req.customer!, {
      page: Number(req.query.page) || undefined,
      perPage: Number(req.query.perPage) || undefined,
    })
    successRes(res, 'Payment history retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function notificationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await listCustomerNotifications(req.customer!.id, {
      page: Number(req.query.page) || undefined,
      perPage: Number(req.query.perPage) || undefined,
      unreadOnly: req.query.unread === 'true',
    })
    successRes(res, 'Notifications retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function unreadNotificationCountHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await getCustomerUnreadCount(req.customer!.id)
    successRes(res, 'Unread notification count retrieved.', { count }, 200)
  } catch (error) {
    next(error)
  }
}

export async function markNotificationReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id)
    await markCustomerNotificationRead(req.customer!.id, id)
    successRes(res, 'Notification marked as read.', { id }, 200)
  } catch (error) {
    next(error)
  }
}

export async function markAllNotificationsReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await markAllCustomerNotificationsRead(req.customer!.id)
    successRes(res, 'All notifications marked as read.', { count }, 200)
  } catch (error) {
    next(error)
  }
}

export async function cancelHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = (req.body ?? {}) as { reason?: string | null }
    const appointment = await cancelOwnAppointment(req.customer!, Number(req.params.id), reason ?? null)
    successRes(res, 'Your appointment has been cancelled.', { appointment }, 200)
  } catch (error) {
    next(error)
  }
}

export async function appointmentByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await getCustomerAppointmentById(req.customer!, Number(req.params.id))
    successRes(res, 'Appointment retrieved.', appointment, 200)
  } catch (error) {
    next(error)
  }
}
