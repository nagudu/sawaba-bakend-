import type { Request, Response, NextFunction } from 'express'
import { getDashboardData } from '../services/dashboardService'
import { successRes } from '../utils/response'

export async function dashboardHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getDashboardData()
    successRes(res, 'Dashboard data retrieved.', data, 200)
  } catch (error) {
    next(error)
  }
}