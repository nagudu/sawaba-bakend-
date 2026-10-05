import type { Request, Response, NextFunction } from 'express'
import {
  createBarber,
  listBarbers,
  getBarberById,
  getBarberByIdForAdmin,
  updateBarber,
  countBarberAppointments,
  deleteBarber,
  getBarberAvailability,
  upsertBarberAvailability,
} from '../services/barberService'
import { successRes } from '../utils/response'
import { Barber } from '../models'
import { uploadImageToCloudinary, deleteImageByUrl } from '../utils/upload'
import { AppError, NotFoundError } from '../utils/errors'
import type { CreateBarberInput, UpdateBarberInput } from '../validators/barber'

async function withUploadedImage(req: Request, next: NextFunction, fallback: string | null): Promise<string | null | undefined> {
  const file = req.file
  if (!file) return fallback

  try {
    const uploaded = await uploadImageToCloudinary(file.buffer, 'sawaba-barbers', file.mimetype)
    return uploaded.url
  } catch (error) {
    next(new AppError('Image upload failed. Please try again.', 500))
    return undefined
  }
}

export async function createBarberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const image = await withUploadedImage(req, next, req.body.image ?? null)
    if (image === undefined) return

    const input: CreateBarberInput = { ...req.body, image }
    const barber = await createBarber(input)
    const message = barber.credentialNotice
      ? `Barber created successfully. ${barber.credentialNotice}`
      : 'Barber created successfully.'
    // credentialNotice stays in the payload so the admin UI can show the
    // email-delivery outcome (null = sent, string = failure reason).
    successRes(res, message, barber, 201)
  } catch (error) {
    next(error)
  }
}

export async function listBarbersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = { ...(req.query as Record<string, unknown>) } as Record<string, unknown> & {
      includeInactive?: string
      barberType?: string
      availableToday?: string
    }
    const authHeader = req.headers.authorization
    const isAdminRequest = Boolean(authHeader && authHeader.startsWith('Bearer '))
    if (!isAdminRequest) {
      // Public callers never get internal filters or inactive barbers.
      delete query.includeInactive
      delete query.barberType
      delete query.availableToday
    }
    const result = await listBarbers(query as never, { adminView: isAdminRequest })
    successRes(res, 'Barbers retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function getBarberByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Admin-authenticated requests get the full business profile (type,
    // commission, location); public requests see the clean public profile.
    const authHeader = req.headers.authorization
    const isAdminRequest = Boolean(authHeader && authHeader.startsWith('Bearer '))
    const barber = isAdminRequest
      ? await getBarberByIdForAdmin(Number(req.params.id))
      : await getBarberById(Number(req.params.id))
    successRes(res, 'Barber retrieved.', barber, 200)
  } catch (error) {
    next(error)
  }
}

export async function updateBarberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id)
    const existing = await getBarberById(id)

    const image = await withUploadedImage(req, next, req.body.image ?? existing.image)
    if (image === undefined) return

    const input: UpdateBarberInput = { ...req.body, image }
    const barber = await updateBarber(id, input)
    const message = barber.credentialNotice
      ? `Barber updated successfully. ${barber.credentialNotice}`
      : 'Barber updated successfully.'
    successRes(res, message, barber, 200)
  } catch (error) {
    next(error)
  }
}

export async function deleteBarberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id)
    const existing = await getBarberById(id)
    const appointmentCount = await countBarberAppointments(id)

    if (appointmentCount > 0) {
      // The barber keeps old appointments/receipts consistent, so they cannot
      // be physically removed — deactivate them instead and say so honestly.
      const [updatedCount] = await Barber.update({ isActive: false }, { where: { id } })
      if (updatedCount === 0) {
        throw new NotFoundError('Barber not found.')
      }
      successRes(
        res,
        `"${existing.name}" has ${appointmentCount} appointment${appointmentCount === 1 ? '' : 's'} on record, so they were deactivated instead of deleted. Their past bookings and receipts stay intact — remove them from services in Edit if you no longer offer those combinations.`,
        { deactivated: true, appointmentCount },
        200,
      )
      return
    }

    await deleteBarber(id)

    if (existing.image) {
      await deleteImageByUrl(existing.image).catch(() => undefined)
    }

    successRes(res, 'Barber deleted successfully.', { deactivated: false }, 200)
  } catch (error) {
    next(error)
  }
}

export async function getAvailabilityHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const availability = await getBarberAvailability(Number(req.params.id))
    successRes(res, 'Barber availability retrieved.', availability, 200)
  } catch (error) {
    next(error)
  }
}

export async function setAvailabilityHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const barberId = Number(req.params.id)
    const entries = Array.isArray(req.body) ? (req.body as Array<{ dayOfWeek: number; startTime: string; endTime: string; isAvailable?: boolean }>) : [req.body]

    const result = await upsertBarberAvailability(barberId, entries)
    successRes(res, 'Barber availability updated.', result, 200)
  } catch (error) {
    next(error)
  }
}