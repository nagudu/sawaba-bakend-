import type { NextFunction, Request, Response } from 'express'
import {
  handlePaystackWebhook,
  initializePaystack,
  isValidPaystackSignature,
  verifyPaystack,
  type PaystackWebhookEvent,
} from '../services/paystackService'
import { handleCheckoutWebhook } from '../services/checkoutService'
import { successRes } from '../utils/response'

export async function initializePaystackHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const init = await initializePaystack(req.params.token)
    successRes(res, 'Payment session created. Redirecting to Paystack…', init, 200)
  } catch (error) {
    next(error)
  }
}

export async function verifyPaystackHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reference } = req.body as { reference: string }
    const result = await verifyPaystack(req.params.token, reference)
    successRes(res, 'Payment verified successfully.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function paystackWebhookHandler(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? ''
  const signature = req.headers['x-paystack-signature'] as string | undefined

  // Invalid signatures get a fast 401 — Paystack retries with valid ones.
  if (!isValidPaystackSignature(rawBody, signature)) {
    res.status(401).json({ success: false, message: 'Invalid signature.' })
    return
  }

  try {
    const payload = JSON.parse(rawBody) as PaystackWebhookEvent
    // Checkout-session payments first, then legacy appointment payments.
    let applied = await handleCheckoutWebhook(payload)
    if (!applied) {
      applied = await handlePaystackWebhook(payload)
    }
    // Always 200 once the signature is valid, even for ignored events.
    res.status(200).json({ success: true, applied })
  } catch (error) {
    // Log but still 200 so Paystack does not spam retries on transient issues;
    // the customer-side verify path remains the reliable fallback.
    console.error('[paystack] webhook processing failed:', (error as Error).message)
    res.status(200).json({ success: true, applied: false })
  }
}
