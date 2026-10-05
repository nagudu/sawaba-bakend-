import type { NextFunction, Request, Response } from 'express'
import {
  getCommissionRateHistory,
  listCommissionRates,
  updateCommissionRate,
} from '../services/commissionRateService'
import { successRes } from '../utils/response'

export async function listCommissionRatesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await listCommissionRates(req.query as never)
    successRes(res, 'Commission rates fetched.', result)
  } catch (error) {
    next(error)
  }
}

export async function getCommissionHistoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const barberId = Number(req.params.barberId)
    const result = await getCommissionRateHistory(barberId, req.query as never)
    successRes(res, 'Commission rate history fetched.', result)
  } catch (error) {
    next(error)
  }
}

export async function updateCommissionRateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const barberId = Number(req.params.barberId)
    const adminId = req.admin!.id
    const result = await updateCommissionRate(barberId, adminId, req.body as never)
    successRes(res, 'Commission rate updated.', result)
  } catch (error) {
    next(error)
  }
}
