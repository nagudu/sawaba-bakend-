import type { NextFunction, Request, Response } from 'express'
import {
  abandonCheckout,
  createCheckoutSession,
  finalizeCheckout,
  getCheckoutSession,
  initializeCheckoutPaystack,
  verifyCheckoutPaystack,
} from '../services/checkoutService'
import { successRes } from '../utils/response'
import type { CreateCheckoutInput } from '../validators/checkout'

/** Multipart — a transfer checkout may carry its receipt file in the same request. */
export async function createCheckoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CreateCheckoutInput
    const receiptFile = (req as Request & { file?: Express.Multer.File }).file
    const session = await createCheckoutSession({
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail || null,
      customerLocation: input.customerLocation || null,
      serviceId: input.serviceId,
      barberId: input.barberId,
      appointmentDate: input.appointmentDate,
      appointmentTime: input.appointmentTime,
      notes: input.notes || null,
      paymentMethod: input.paymentMethod,
      transactionReference: input.transactionReference || null,
      receiptBuffer: receiptFile?.buffer ?? null,
      receiptMimetype: receiptFile?.mimetype ?? null,
    })
    successRes(res, 'Booking session created.', session, 201)
  } catch (error) {
    next(error)
  }
}

export async function getCheckoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await getCheckoutSession(req.params.sessionToken)
    successRes(res, 'Booking session retrieved.', session, 200)
  } catch (error) {
    next(error)
  }
}

export async function initializeCheckoutPaystackHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const init = await initializeCheckoutPaystack(req.params.sessionToken)
    successRes(res, 'Payment session created. Redirecting to Paystack…', init, 200)
  } catch (error) {
    next(error)
  }
}

export async function verifyCheckoutPaystackHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reference } = req.body as { reference: string }
    const result = await verifyCheckoutPaystack(req.params.sessionToken, reference)
    successRes(res, 'Payment verified. Your appointment has been booked.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function finalizeCheckoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await finalizeCheckout(req.params.sessionToken)
    successRes(
      res,
      'Your appointment has been submitted. We will contact you to confirm.',
      result,
      201,
    )
  } catch (error) {
    next(error)
  }
}

export async function abandonCheckoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await abandonCheckout(req.params.sessionToken)
    successRes(res, 'Booking session closed.', result, 200)
  } catch (error) {
    next(error)
  }
}
