import type { Request, Response, NextFunction } from 'express'
import {
  listEarnings,
  getEarningsSummary,
  getCommissionReport,
  getBarberPerformance,
  markEarningPaid,
} from '../services/commissionService'
import { assignBarber, getAssignmentHistory } from '../services/assignmentService'
import { successRes } from '../utils/response'
import type { EarningsQuery } from '../validators/barberEarning'

export async function listEarningsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await listEarnings(req.query as unknown as EarningsQuery)
    successRes(res, 'Barber earnings retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function earningsSummaryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await getEarningsSummary(req.query as unknown as EarningsQuery)
    successRes(res, 'Barber earnings summary retrieved.', rows, 200)
  } catch (error) {
    next(error)
  }
}

export async function commissionReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await getCommissionReport(req.query as unknown as EarningsQuery)
    successRes(res, 'Commission report retrieved.', report, 200)
  } catch (error) {
    next(error)
  }
}

export async function barberPerformanceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await getBarberPerformance(req.query as unknown as EarningsQuery)
    successRes(res, 'Barber performance report retrieved.', rows, 200)
  } catch (error) {
    next(error)
  }
}

export async function markEarningPaidHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const earning = await markEarningPaid(Number(req.params.id))
    successRes(res, 'Commission marked as paid.', earning, 200)
  } catch (error) {
    next(error)
  }
}

export async function assignBarberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await assignBarber(
      Number(req.params.id),
      req.body as { barberId: number | null; reason?: string | null },
      req.admin?.id ?? null,
    )
    successRes(res, 'Barber assignment updated.', appointment, 200)
  } catch (error) {
    next(error)
  }
}

export async function assignmentHistoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const history = await getAssignmentHistory(Number(req.params.id))
    successRes(res, 'Assignment history retrieved.', history, 200)
  } catch (error) {
    next(error)
  }
}
