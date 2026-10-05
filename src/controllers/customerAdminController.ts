import type { NextFunction, Request, Response } from 'express'
import { listCustomers } from '../services/customerService'
import {
  adminUpdateCustomer,
  getCustomerDetail,
  sendDueReminders,
} from '../services/customerAdminService'
import { successRes } from '../utils/response'

export async function listHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await listCustomers({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: Number(req.query.page) || undefined,
      perPage: Number(req.query.perPage) || undefined,
      includeInactive: req.query.includeInactive === 'true',
    })
    successRes(res, 'Customers retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function detailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const detail = await getCustomerDetail(Number(req.params.id))
    successRes(res, 'Customer retrieved.', detail, 200)
  } catch (error) {
    next(error)
  }
}

export async function updateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patch = req.body as { fullName?: string; email?: string | null; isActive?: boolean; reminderOptIn?: boolean }
    const customer = await adminUpdateCustomer(Number(req.params.id), patch)
    successRes(res, 'Customer updated.', { customer: { id: customer.id } }, 200)
  } catch (error) {
    next(error)
  }
}

export async function remindHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dryRun = req.query.dryRun === 'true'
    const result = await sendDueReminders({ dryRun })
    successRes(res, dryRun ? 'Reminder preview.' : 'Reminders sent.', result, 200)
  } catch (error) {
    next(error)
  }
}
