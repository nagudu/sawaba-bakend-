import type { Request, Response, NextFunction } from 'express'
import { listCustomers } from '../services/customerService'
import { successRes } from '../utils/response'

export async function listCustomersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as Record<string, unknown>
    const result = await listCustomers(query)
    successRes(res, 'Customers retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}