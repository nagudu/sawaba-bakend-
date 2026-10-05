import type { Request, Response, NextFunction } from 'express'
import {
  createAppointment,
  listAppointments,
  getAppointmentById,
  updateAppointment,
  updateAppointmentStatus,
  reactivateAppointment,
  deleteAppointment,
} from '../services/appointmentService'
import { successRes } from '../utils/response'
import { APPOINTMENT_STATUSES } from '../types'
import { getValidNextStatuses } from '../config/appointmentStatuses'
import type { CreateAppointmentInput, UpdateAppointmentInput } from '../validators/appointment'

/** Multipart requests deliver every field as a string — passthrough unchanged; zod coerces. */
export async function createAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CreateAppointmentInput
    const receiptFile = (req as Request & { file?: Express.Multer.File }).file
    const appointment = await createAppointment(input, receiptFile?.buffer ?? null, receiptFile?.mimetype)
    successRes(
      res,
      'Your appointment request has been successfully submitted. We will contact you to confirm your appointment.',
      appointment,
      201,
    )
  } catch (error) {
    next(error)
  }
}

export async function listAppointmentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as Record<string, unknown>
    const result = await listAppointments(query)
    successRes(res, 'Appointments retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function getAppointmentByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await getAppointmentById(Number(req.params.id))
    successRes(res, 'Appointment retrieved.', appointment, 200)
  } catch (error) {
    next(error)
  }
}

export async function updateAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as UpdateAppointmentInput
    const appointment = await updateAppointment(Number(req.params.id), input)
    successRes(res, 'Appointment updated successfully.', appointment, 200)
  } catch (error) {
    next(error)
  }
}

export async function updateAppointmentStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, cancellationReason } = req.body as {
      status: (typeof APPOINTMENT_STATUSES)[number]
      cancellationReason?: string | null
    }
    const adminId = req.admin?.id
    const appointment = await updateAppointmentStatus(Number(req.params.id), status, {
      cancellationReason: cancellationReason ?? null,
      cancelledBy: adminId ?? null,
      updatedByAdminId: adminId ?? null,
    })
    successRes(res, 'Appointment status updated successfully.', {
      ...appointment,
      availableNextSteps: getValidNextStatuses(appointment.status),
    }, 200)
  } catch (error) {
    next(error)
  }
}

export async function reactivateAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await reactivateAppointment(Number(req.params.id))
    successRes(res, 'Appointment reactivated successfully.', appointment, 200)
  } catch (error) {
    next(error)
  }
}

export async function deleteAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteAppointment(Number(req.params.id))
    successRes(res, 'Appointment deleted successfully.', {}, 200)
  } catch (error) {
    next(error)
  }
}