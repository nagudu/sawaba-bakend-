import type { NextFunction, Request, Response } from 'express'
import {
  cancelOwnAppointment,
  getCustomerAppointmentById,
  getCustomerAppointments,
  getCustomerPayments,
  getCustomerSummary,
} from '../services/customerMeService'
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
