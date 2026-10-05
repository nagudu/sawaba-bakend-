import crypto from 'node:crypto'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import {
  applyProviderVerification,
  getPaymentByAccessToken,
  type PublicPaymentBundle,
} from './paymentService'
import type { Payment } from '../models/Payment'

/**
 * Paystack online-payment integration.
 *
 * Flow (never trusts the frontend alone):
 *   1. initializePaystack   — backend creates a transaction for the appointment's
 *                             stored amount and returns Paystack's checkout URL.
 *   2. Customer pays on Paystack.
 *   3a. verifyPaystack      — backend GETs the transaction directly from Paystack
 *                             and only marks PAID when Paystack itself says success.
 *   3b. webhook             — Paystack also notifies us; the x-paystack-signature
 *                             HMAC (raw body + secret key) is validated first.
 *
 * Keys come exclusively from env: PAYSTACK_SECRET_KEY / PAYSTACK_PUBLIC_KEY.
 */

const PAYSTACK_BASE = 'https://api.paystack.co'

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) {
    throw new UnprocessableError('Online payment is not configured. Please contact the administrator.')
  }
  return key
}

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY)
}

export function paystackPublicKey(): string | null {
  return process.env.PAYSTACK_PUBLIC_KEY ?? null
}

async function paystackRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${PAYSTACK_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw new UnprocessableError('Unable to connect to the payment gateway. Please try again.')
  }
  const json = (await response.json().catch(() => null)) as
    | { status: boolean; message: string; data: T }
    | null
  if (!response.ok || !json?.status) {
    throw new UnprocessableError(
      json?.message ?? 'The payment gateway rejected this request. Please try again.',
    )
  }
  return json.data
}

function clientCallbackUrl(token: string): string {
  const base = process.env.CLIENT_URL ?? 'http://localhost:5173'
  // The token must be baked into the URL: Paystack only appends ?reference= on return.
  return `${base.replace(/\/$/, '')}/payments/callback?token=${encodeURIComponent(token)}`
}

export interface PaystackInitResult {
  authorizationUrl: string
  accessCode: string
  reference: string
}

/** Creates a Paystack transaction for the payment's appointment amount. */
export async function initializePaystack(token: string): Promise<PaystackInitResult> {
  const payment = await getPaymentByAccessToken(token)
  const appointment = payment.appointment
  if (!appointment) {
    throw new NotFoundError('Payment record not found for this appointment.')
  }
  if (appointment.status === 'CANCELLED') {
    throw new UnprocessableError('This appointment has been cancelled and cannot accept a payment.')
  }
  if (payment.status === 'PAID') {
    throw new UnprocessableError('This appointment has already been paid and verified.')
  }
  if (payment.status === 'PENDING_VERIFICATION') {
    throw new UnprocessableError(
      'A manual payment receipt is already under review for this appointment.',
    )
  }

  // Amount always comes from the stored appointment price, in kobo — never the client.
  const amountKobo = Math.round(Number(appointment.totalAmount) * 100)
  // Paystack requires a recipient email and rejects reserved TLDs like
  // .local — guest bookings without an email get a stable, well-formed
  // address under the salon domain (used only for the transaction record).
  const email =
    appointment.customerEmail ??
    `${appointment.customerPhone.replace(/\D/g, '')}@payments.sawabasalon.com`
  const reference = `SAWABA-APT${appointment.id}-${Date.now()}`

  const init = await paystackRequest<{ authorization_url: string; access_code: string; reference: string }>(
    'POST',
    '/transaction/initialize',
    {
      email,
      amount: amountKobo,
      reference,
      callback_url: clientCallbackUrl(token),
      metadata: {
        appointmentId: appointment.id,
        paymentId: payment.id,
        customerName: appointment.customerName,
      },
    },
  )

  await payment.update({
    paymentMethod: 'ONLINE',
    transactionReference: init.reference,
  })

  return {
    authorizationUrl: init.authorization_url,
    accessCode: init.access_code,
    reference: init.reference,
  }
}

/** Re-reads the transaction from Paystack and only then marks the payment verified. */
export async function verifyPaystack(
  token: string,
  reference: string,
): Promise<PublicPaymentBundle> {
  const payment: Payment = await getPaymentByAccessToken(token)
  if (payment.status === 'PAID') {
    // Already verified (e.g. by the webhook moments earlier) — just return current state.
    return applyProviderVerification(payment.appointmentId, null)
  }

  const expectedRef = payment.transactionReference
  if (expectedRef && reference !== expectedRef) {
    throw new UnprocessableError('This payment reference does not match this appointment.')
  }

  const txn = await paystackRequest<{ status: string; amount: number; id: number }>(
    'GET',
    `/transaction/verify/${encodeURIComponent(reference)}`,
  )

  if (txn.status !== 'success') {
    throw new UnprocessableError(
      `Paystack reports this payment as "${txn.status}". No payment has been recorded — please try again or use bank transfer.`,
    )
  }

  // Paystack is the authority: confirm the kobo amount matches the stored appointment price.
  const appointment = payment.appointment
  if (!appointment) {
    throw new NotFoundError('Payment record not found for this appointment.')
  }
  const expectedKobo = Math.round(Number(appointment.totalAmount) * 100)
  if (txn.amount !== expectedKobo) {
    throw new UnprocessableError(
      'The paid amount does not match the appointment price. Please contact support.',
    )
  }

  return applyProviderVerification(payment.appointmentId, {
    provider: 'paystack',
    providerRef: String(txn.id),
    adminId: null,
  })
}

/** Validates the x-paystack-signature HMAC over the RAW request body. */
export function isValidPaystackSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  } catch {
    return false
  }
}

export interface PaystackWebhookEvent {
  event: string
  data: {
    status?: string
    amount?: number
    id?: number
    reference?: string
    metadata?: { appointmentId?: number }
  }
}

/** Processes a charge.success webhook (already signature-verified). */
export async function handlePaystackWebhook(payload: PaystackWebhookEvent): Promise<boolean> {
  if (payload.event !== 'charge.success') return false
  const appointmentId = payload.data?.metadata?.appointmentId
  if (!appointmentId) return false

  const verified = await applyProviderVerification(appointmentId, {
    provider: 'paystack',
    providerRef: String(payload.data.id ?? payload.data.reference ?? 'webhook'),
    adminId: null,
  })
  return verified.payment.status === 'PAID'
}
