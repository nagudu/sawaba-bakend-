import type { Request, Response, NextFunction } from 'express'
import { getAvailableTimeSlots } from '../services/availabilityService'
import { successRes } from '../utils/response'
import { Service } from '../models'

export async function getAvailabilityHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const barberId = Number(req.query.barberId)
    const date = String(req.query.date)
    const durationOverride = Number(req.query.duration) || undefined

    let duration = durationOverride
    if (!duration && req.query.serviceId) {
      const service = await Service.findByPk(Number(req.query.serviceId))
      if (service) duration = service.duration
    }
    if (!duration) duration = 30

    const slots = await getAvailableTimeSlots(barberId, date, duration)
    successRes(res, 'Available time slots retrieved.', {
      barberId,
      date,
      duration,
      slots,
    }, 200)
  } catch (error) {
    next(error)
  }
}