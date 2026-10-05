import type { NextFunction, Request, Response } from 'express'
import {
  confirmCashPayment,
  declareCashPayment,
  getPublicPayment,
  getPaymentById,
  listPayments,
  rejectPayment,
  submitPayment,
  trackPayment,
  verifyPayment,
} from '../services/paymentService'
import { getPublicPaymentSettings } from '../services/paymentSettingsService'
import { successRes } from '../utils/response'
import type { CashConfirmInput, RejectPaymentInput, SubmitPaymentInput, TrackPaymentInput } from '../validators/payment'

export async function getPaymentSettingsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await getPublicPaymentSettings()
    successRes(res, 'Payment details retrieved.', settings, 200)
  } catch (error) {
    next(error)
  }
}

export async function getPublicPaymentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await getPublicPayment(req.params.token)
    successRes(res, 'Payment details retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function declareCashHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await declareCashPayment(req.params.token)
    successRes(res, 'Cash payment selected — please pay at the salon.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function submitPaymentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as SubmitPaymentInput
    const file = (req as Request & { file?: Express.Multer.File }).file
    const result = await submitPayment(req.params.token, input, file?.buffer ?? null)
    successRes(
      res,
      'Your payment receipt has been submitted and is awaiting verification. We will notify you once it is confirmed.',
      result,
      200,
    )
  } catch (error) {
    next(error)
  }
}

export async function trackPaymentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as TrackPaymentInput
    const result = await trackPayment(input)
    successRes(res, 'Payment details retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function listPaymentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as Record<string, unknown>
    const result = await listPayments(query)
    successRes(res, 'Payments retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function getPaymentByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await getPaymentById(Number(req.params.id))
    successRes(res, 'Payment retrieved.', payment, 200)
  } catch (error) {
    next(error)
  }
}

export async function verifyPaymentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.admin?.id
    const payment = await verifyPayment(Number(req.params.id), Number(adminId))
    successRes(
      res,
      'Payment verified. The appointment has been confirmed and marked ready for service.',
      payment,
      200,
    )
  } catch (error) {
    next(error)
  }
}

export async function confirmCashHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.admin?.id
    const { note } = req.body as CashConfirmInput
    const payment = await confirmCashPayment(Number(req.params.id), Number(adminId), note ?? null)
    successRes(
      res,
      'Cash payment confirmed. The appointment has been confirmed.',
      payment,
      200,
    )
  } catch (error) {
    next(error)
  }
}

export async function rejectPaymentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.admin?.id
    const { reason } = req.body as RejectPaymentInput
    const payment = await rejectPayment(Number(req.params.id), reason, Number(adminId))
    successRes(
      res,
      'Payment rejected. The customer has been moved back to the payment step.',
      payment,
      200,
    )
  } catch (error) {
    next(error)
  }
}