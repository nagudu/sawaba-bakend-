import type { NextFunction, Request, Response } from 'express'
import {
  getPaymentSettingsRecord,
  serializePaymentSetting,
  updatePaymentSettings,
} from '../services/paymentSettingsService'
import { successRes } from '../utils/response'
import type { UpdatePaymentSettingsInput } from '../validators/paymentSettings'

export async function getPaymentSettingsAdminHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await getPaymentSettingsRecord()
    successRes(res, 'Payment settings retrieved.', serializePaymentSetting(settings), 200)
  } catch (error) {
    next(error)
  }
}

export async function updatePaymentSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as UpdatePaymentSettingsInput
    const settings = await updatePaymentSettings(input)
    successRes(res, 'Payment settings updated successfully.', settings, 200)
  } catch (error) {
    next(error)
  }
}