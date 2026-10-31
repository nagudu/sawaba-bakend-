import { prisma } from '../config/database'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import type { Prisma } from '@prisma/client'
import { naira } from './marketplaceService'
import { recordPaymentEvent, serializeOrder, type OrderView } from './shopService'
import { isPaystackConfigured } from './paystackService'

/**
 * Marketplace order payments.
 *
 * An order only becomes PAYMENT_CONFIRMED / PAID through TRUSTED verification:
 *   - BANK_TRANSFER / OPAY: an admin verifies the transfer against the bank
 *     statement (a customer-uploaded receipt alone is never proof).
 *   - ONLINE (Paystack): the backend re-reads the transaction from Paystack
 *     (verify API + webhook signature) before marking anything paid.
 *
 * The moment an order becomes PAID, `materializeCommissionLedger` writes the
 * financial ledger (one row per order item, unique on orderItemId) — so
 * commission is recorded exactly once, with the rate frozen at sale time.
 */

const orderInclude = {
  items: {
    include: { vendor: { select: { id: true, businessName: true } } },
    orderBy: { id: 'asc' as const },
  },
} as const

type OrderWithItems = Prisma.ShopOrderGetPayload<{ include: typeof orderInclude }>

async function loadOrder(id: number): Promise<OrderWithItems> {
  const order = await prisma.shopOrder.findUnique({
    where: { id },
    include: orderInclude,
  })
  if (!order) throw new NotFoundError('Order not found.')
  return order
}

/**
 * Creates the commission ledger for a PAID order — idempotent thanks to
 * `@@unique(orderItemId)`; calling it twice can never double-charge or
 * double-earn. Also bumps each product's salesCount.
 */
export async function materializeCommissionLedger(
  order: OrderWithItems,
  tx: Prisma.TransactionClient,
): Promise<void> {
  for (const item of order.items) {
    const existing = await tx.commissionLedger.findUnique({
      where: { orderItemId: item.id },
    })
    if (existing) continue

    await tx.commissionLedger.create({
      data: {
        orderId: order.id,
        orderItemId: item.id,
        vendorId: item.vendorId,
        productId: item.productId,
        quantity: item.quantity,
        salePrice: item.lineTotal,
        commissionRate: item.commissionRate,
        commissionAmount: item.commissionAmount,
        vendorNet: item.vendorNet,
        settlementStatus: 'PENDING',
      },
    })

    await tx.product.update({
      where: { id: item.productId },
      data: { salesCount: { increment: item.quantity } },
    })
  }
}

/**
 * Marks an order paid after trusted verification and materializes the ledger.
 * One transaction → payment, order, ledger and notifications stay consistent.
 */
export async function markOrderPaid(
  orderId: number,
  event: {
    provider?: string
    providerRef?: string | null
    transactionRef?: string | null
    adminId?: number | null
    detail: string
    actorRole: string
    amount: number
  },
): Promise<OrderWithItems> {
  const order = await loadOrder(orderId)
  if (order.paymentStatus === 'PAID') return order // idempotent

  return prisma.$transaction(async (tx) => {
    const updated = await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'PAID',
        paymentVerifiedAt: new Date(),
        paymentVerifiedBy: event.adminId ?? null,
        transactionRef: event.transactionRef ?? order.transactionRef,
        status: order.status === 'AWAITING_PAYMENT' ? 'PAYMENT_CONFIRMED' : order.status,
      },
      include: orderInclude,
    })

    await tx.shopPayment.update({
      where: { orderId: order.id },
      data: {
        status: 'PAID',
        verifiedAt: new Date(),
        verifiedByAdminId: event.adminId ?? null,
        providerRef: event.providerRef ?? null,
        transactionRef: event.transactionRef ?? null,
        rejectionReason: null,
      },
    })

    await recordPaymentEvent(
      order.id,
      {
        type: 'PAYMENT_VERIFIED',
        status: 'PAID',
        provider: event.provider,
        providerRef: event.providerRef,
        transactionRef: event.transactionRef,
        amount: event.amount,
        actorRole: event.actorRole,
        actorId: event.adminId,
        detail: event.detail,
      },
      tx,
    )

    await materializeCommissionLedger(updated, tx)

    for (const vendorId of [...new Set(updated.items.map((item) => item.vendorId))]) {
      await tx.vendorNotification.create({
        data: {
          vendorId,
          type: 'PAYMENT',
          title: 'Payment confirmed',
          message: `Payment for order ${updated.referenceCode} has been confirmed. Prepare the item(s) for dispatch.`,
        },
      })
    }

    return updated
  })
}

/** Admin verifies a transfer/OPay receipt against the bank statement. */
export async function verifyOrderPayment(
  reference: string,
  adminId: number,
  note?: string,
): Promise<OrderView> {
  const order = await prisma.shopOrder.findUnique({
    where: { referenceCode: reference.toUpperCase() },
  })
  if (!order) throw new NotFoundError('Order not found.')
  if (order.paymentStatus === 'PAID') {
    throw new UnprocessableError('This order has already been verified as paid.')
  }
  if (order.paymentStatus === 'CANCELLED') {
    throw new UnprocessableError('This order was cancelled — payment cannot be verified.')
  }
  if (!['BANK_TRANSFER', 'OPAY'].includes(order.paymentMethod)) {
    throw new UnprocessableError('Only bank transfer and OPay payments can be verified manually.')
  }
  if (order.paymentStatus !== 'PENDING_VERIFICATION') {
    throw new UnprocessableError('This order has no payment awaiting verification.')
  }

  const updated = await markOrderPaid(order.id, {
    adminId,
    actorRole: 'ADMIN',
    amount: Number(order.totalAmount),
    transactionRef: order.transactionRef,
    detail: note?.trim() || 'Admin verified transfer payment',
  })
  return serializeOrder(updated)
}

/** Admin rejects a suspicious/unmatched receipt — order stays unpaid. */
export async function rejectOrderPayment(
  reference: string,
  adminId: number,
  reason: string,
): Promise<OrderView> {
  const order = await prisma.shopOrder.findUnique({
    where: { referenceCode: reference.toUpperCase() },
    include: orderInclude,
  })
  if (!order) throw new NotFoundError('Order not found.')
  if (order.paymentStatus === 'PAID') {
    throw new UnprocessableError('A paid order cannot be rejected — issue a refund instead.')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.shopOrder.update({
      where: { id: order.id },
      data: { paymentStatus: 'REJECTED', paymentNote: reason },
      include: orderInclude,
    })
    await tx.shopPayment.update({
      where: { orderId: order.id },
      data: { status: 'REJECTED', rejectionReason: reason },
    })
    await recordPaymentEvent(
      order.id,
      {
        type: 'PAYMENT_REJECTED',
        status: 'REJECTED',
        amount: Number(order.totalAmount),
        actorRole: 'ADMIN',
        actorId: adminId,
        detail: reason,
      },
      tx,
    )
    return result
  })
  return serializeOrder(updated)
}

// ─── Paystack (online card payments) ─────────────────────────────────────────

const PAYSTACK_BASE = 'https://api.paystack.co'

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) {
    throw new UnprocessableError('Online payment is not configured. Please contact the administrator.')
  }
  return key
}

async function paystackRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
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
  } catch {
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

function shopCallbackUrl(reference: string): string {
  const base = process.env.CLIENT_URL ?? 'http://localhost:5173'
  return `${base.replace(/\/$/, '')}/shop/orders/${encodeURIComponent(reference)}`
}

export interface ShopPaystackInitResult {
  authorizationUrl: string
  accessCode: string
  reference: string
}

/** Starts a Paystack transaction for a shop order's STORED total (kobo). */
export async function initializeShopOrderPaystack(reference: string): Promise<ShopPaystackInitResult> {
  if (!isPaystackConfigured()) {
    throw new UnprocessableError('Online payment is not configured. Please use bank transfer.')
  }
  const order = await prisma.shopOrder.findUnique({
    where: { referenceCode: reference.toUpperCase() },
  })
  if (!order) throw new NotFoundError('Order not found.')
  if (order.paymentStatus === 'PAID') {
    throw new UnprocessableError('This order has already been paid.')
  }
  if (order.status === 'CANCELLED') {
    throw new UnprocessableError('This order has been cancelled.')
  }

  const amountKobo = Math.round(Number(order.totalAmount) * 100)
  const email =
    order.customerEmail ??
    `${order.customerPhone.replace(/\D/g, '')}@shop.sawabasalon.com`
  const paystackRef = `SAWABA-SHOP${order.id}-${Date.now()}`

  const init = await paystackRequest<{ authorization_url: string; access_code: string; reference: string }>(
    'POST',
    '/transaction/initialize',
    {
      email,
      amount: amountKobo,
      reference: paystackRef,
      callback_url: shopCallbackUrl(order.referenceCode),
      metadata: {
        shopOrderId: order.id,
        orderReference: order.referenceCode,
        customerName: order.customerName,
      },
    },
  )

  await prisma.$transaction(async (tx) => {
    await tx.shopOrder.update({
      where: { id: order.id },
      data: { transactionRef: init.reference, paymentMethod: 'ONLINE' },
    })
    await tx.shopPayment.update({
      where: { orderId: order.id },
      data: { transactionRef: init.reference, paymentMethod: 'ONLINE' },
    })
    await recordPaymentEvent(
      order.id,
      {
        type: 'PAYSTACK_INIT',
        status: 'UNPAID',
        provider: 'paystack',
        providerRef: init.reference,
        amount: Number(order.totalAmount),
        detail: 'Paystack transaction initialized',
      },
      tx,
    )
  })

  return { authorizationUrl: init.authorization_url, accessCode: init.access_code, reference: init.reference }
}

/** Re-reads the transaction from Paystack; only Paystack can mark it paid. */
export async function verifyShopOrderPaystack(
  reference: string,
  paystackReference: string,
): Promise<OrderView> {
  const order = await prisma.shopOrder.findUnique({
    where: { referenceCode: reference.toUpperCase() },
  })
  if (!order) throw new NotFoundError('Order not found.')
  if (order.paymentStatus === 'PAID') {
    const current = await loadOrder(order.id)
    return serializeOrder(current)
  }
  const expected = order.transactionRef
  if (expected && paystackReference !== expected) {
    throw new UnprocessableError('This payment reference does not match this order.')
  }

  const txn = await paystackRequest<{ status: string; amount: number; id: number }>(
    'GET',
    `/transaction/verify/${encodeURIComponent(paystackReference)}`,
  )

  if (txn.status !== 'success') {
    throw new UnprocessableError(
      `Paystack reports this payment as "${txn.status}". No payment has been recorded — please try again or use bank transfer.`,
    )
  }

  const expectedKobo = Math.round(Number(order.totalAmount) * 100)
  if (txn.amount !== expectedKobo) {
    throw new UnprocessableError('The paid amount does not match the order total. Please contact support.')
  }

  const updated = await markOrderPaid(order.id, {
    provider: 'paystack',
    providerRef: String(txn.id),
    transactionRef: paystackReference,
    actorRole: 'CUSTOMER',
    amount: Number(order.totalAmount),
    detail: 'Paystack server-side verification succeeded',
  })
  return serializeOrder(updated)
}

/**
 * Webhook entry — already signature-verified by the caller. Handles shop orders
 * (metadata.shopOrderId) and returns false for appointment events so the
 * existing appointment handler keeps ownership of those.
 */
export async function handleShopOrderWebhook(payload: {
  event: string
  data: {
    status?: string
    amount?: number
    id?: number
    reference?: string
    metadata?: { shopOrderId?: number }
  }
}): Promise<boolean> {
  if (payload.event !== 'charge.success') return false
  const shopOrderId = payload.data?.metadata?.shopOrderId
  if (!shopOrderId) return false

  const order = await prisma.shopOrder.findUnique({ where: { id: shopOrderId } })
  if (!order || order.paymentStatus === 'PAID') return Boolean(order)

  const expectedKobo = Math.round(Number(order.totalAmount) * 100)
  if (payload.data.amount && payload.data.amount !== expectedKobo) {
    return false
  }

  const updated = await markOrderPaid(shopOrderId, {
    provider: 'paystack',
    providerRef: String(payload.data.id ?? payload.data.reference ?? 'webhook'),
    transactionRef: payload.data.reference ?? null,
    actorRole: 'SYSTEM',
    amount: Number(order.totalAmount),
    detail: 'Paystack webhook charge.success',
  })
  return updated.paymentStatus === 'PAID'
}

/** Vendor-facing notification helper used across services. */
export async function notifyVendors(
  vendorIds: number[],
  notification: { type: string; title: string; message: string },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  for (const vendorId of vendorIds) {
    await tx.vendorNotification.create({ data: { vendorId, ...notification } })
  }
}

export { naira }
