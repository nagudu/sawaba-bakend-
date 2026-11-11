import { dispatchNotification, type NotificationCustomer, type NotificationDispatchContext } from './notificationService'
import { buildOrderTrackingUrl } from '../utils/orderTrackingToken'

/**
 * Semantic notification builders used by business flows. Each helper:
 *   - maps the domain record to a `NotificationCustomer` + dispatch context,
 *   - supplies a STABLE dedupe key so repeats/retries never double-send,
 *   - delegates to `dispatchNotification` (fire-and-forget, never throws).
 *
 * Keeping the mapping here means call sites stay one-liners and the copy/context
 * stays consistent across bookings, orders, payments and refunds.
 */

function num(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

interface AppointmentRef {
  id: number
  referenceCode?: string | null
  customerId?: number | null
  customerName?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
  appointmentDate?: string | null
  appointmentTime?: string | null
  totalAmount?: unknown
  status?: string | null
  service?: { name?: string | null } | null
  barber?: { name?: string | null } | null
}

interface PaymentRef {
  amount?: unknown
  status?: string | null
  paymentMethod?: string | null
}

interface OrderRef {
  id: number
  referenceCode?: string | null
  customerId?: number | null
  customerName?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
  totalAmount?: unknown
  fulfillmentType?: string | null
  pickupCode?: string | null
  pickupShopName?: string | null
  pickupAddress?: string | null
  deliveryAddress?: string | null
  estimatedDeliveryAt?: Date | string | null
  paymentMethod?: string | null
  paymentStatus?: string | null
  status?: string | null
  items?: Array<{ productName?: string | null; quantity?: number | null; lineTotal?: unknown }> | null
}

function appointmentCustomer(appointment: AppointmentRef): NotificationCustomer {
  return {
    id: appointment.customerId ?? null,
    fullName: appointment.customerName ?? null,
    phone: appointment.customerPhone ?? null,
    email: appointment.customerEmail ?? null,
  }
}

function orderCustomer(order: OrderRef, fallbackId?: number | null): NotificationCustomer {
  return {
    id: order.customerId ?? fallbackId ?? null,
    fullName: order.customerName ?? null,
    phone: order.customerPhone ?? null,
    email: order.customerEmail ?? null,
  }
}

function appointmentContext(
  appointment: AppointmentRef,
  extra: Partial<NotificationDispatchContext> = {},
): NotificationDispatchContext {
  return {
    appointmentId: appointment.id,
    appointmentRef: appointment.referenceCode ?? null,
    serviceName: appointment.service?.name ?? null,
    barberName: appointment.barber?.name ?? null,
    appointmentDate: appointment.appointmentDate ?? null,
    appointmentTime: appointment.appointmentTime ?? null,
    amount: num(appointment.totalAmount),
    status: appointment.status ?? null,
    ...extra,
  }
}

function orderContext(order: OrderRef, extra: Partial<NotificationDispatchContext> = {}): NotificationDispatchContext {
  const trackingUrl = order.referenceCode
    ? buildOrderTrackingUrl({ orderId: order.id, referenceCode: order.referenceCode })
    : null
  return {
    orderId: order.id,
    orderRef: order.referenceCode ?? null,
    amount: num(order.totalAmount),
    trackingUrl,
    deliveryMethod:
      order.fulfillmentType === 'PICKUP'
        ? 'PICKUP'
        : order.fulfillmentType === 'DELIVERY'
          ? 'DELIVERY'
          : null,
    collectionCode: order.pickupCode ?? null,
    paymentMethod: order.paymentMethod ?? null,
    paymentStatus: order.paymentStatus ?? null,
    status: order.status ?? null,
    items: (order.items ?? []).map((item) => ({
      name: item.productName ?? 'Item',
      quantity: Number(item.quantity ?? 1),
      lineTotal: num(item.lineTotal),
    })),
    deliveryAddress: order.deliveryAddress ?? null,
    pickupShopName: order.pickupShopName ?? null,
    pickupAddress: order.pickupAddress ?? null,
    estimatedDeliveryAt:
      order.estimatedDeliveryAt instanceof Date
        ? order.estimatedDeliveryAt.toISOString()
        : order.estimatedDeliveryAt ?? null,
    ...extra,
  }
}

// ─── Account ──────────────────────────────────────────────────────────────────

export async function notifyWelcome(customer: NotificationCustomer): Promise<void> {
  const key = customer.id ? `welcome:${customer.id}` : customer.email ?? customer.phone ?? undefined
  await dispatchNotification({
    event: 'WELCOME',
    customer,
    dedupeKey: key ? `welcome:${key}` : undefined,
  })
}

// ─── Bookings / appointments ────────────────────────────────────────────────

export async function notifyBookingConfirmation(
  appointment: AppointmentRef,
  payment?: PaymentRef | null,
): Promise<void> {
  await dispatchNotification({
    event: 'BOOKING_CONFIRMATION',
    customer: appointmentCustomer(appointment),
    context: appointmentContext(appointment, {
      amount: num(payment?.amount ?? appointment.totalAmount),
      paymentMethod: payment?.paymentMethod ?? null,
      paymentStatus: payment?.status ?? null,
    }),
    dedupeKey: `booking:${appointment.id}:BOOKING_CONFIRMATION`,
  })
}

export async function notifyBookingStatus(
  appointment: AppointmentRef,
  status: string,
  reason?: string | null,
): Promise<void> {
  await dispatchNotification({
    event: 'BOOKING_STATUS',
    customer: appointmentCustomer(appointment),
    context: appointmentContext(appointment, { status, reason: reason ?? null }),
    dedupeKey: `booking:${appointment.id}:BOOKING_STATUS:${status}`,
  })
}

export async function notifyBookingCancelled(appointment: AppointmentRef, reason?: string | null): Promise<void> {
  await dispatchNotification({
    event: 'BOOKING_CANCELLED',
    customer: appointmentCustomer(appointment),
    context: appointmentContext(appointment, { reason: reason ?? null }),
    dedupeKey: `booking:${appointment.id}:BOOKING_CANCELLED`,
  })
}

export async function notifyBookingReminder(appointment: AppointmentRef, kind: string): Promise<void> {
  await dispatchNotification({
    event: 'BOOKING_REMINDER',
    customer: appointmentCustomer(appointment),
    context: appointmentContext(appointment),
    dedupeKey: `reminder:${appointment.id}:${kind}`,
  })
}

export async function notifyAppointmentPaymentSuccess(
  appointment: AppointmentRef,
  payment?: PaymentRef | null,
): Promise<void> {
  await dispatchNotification({
    event: 'PAYMENT_SUCCESS',
    customer: appointmentCustomer(appointment),
    context: appointmentContext(appointment, {
      amount: num(payment?.amount ?? appointment.totalAmount),
      paymentMethod: payment?.paymentMethod ?? null,
      paymentStatus: payment?.status ?? 'PAID',
      status: appointment.status ?? null,
    }),
    dedupeKey: `booking:${appointment.id}:PAYMENT_SUCCESS`,
  })
}

export async function notifyAppointmentPaymentFailed(
  appointment: AppointmentRef,
  reason?: string | null,
  payment?: PaymentRef | null,
): Promise<void> {
  await dispatchNotification({
    event: 'PAYMENT_FAILED',
    customer: appointmentCustomer(appointment),
    context: appointmentContext(appointment, {
      amount: num(payment?.amount ?? appointment.totalAmount),
      paymentMethod: payment?.paymentMethod ?? null,
      status: payment?.status ?? appointment.status ?? null,
      reason: reason ?? null,
    }),
    dedupeKey: `booking:${appointment.id}:PAYMENT_FAILED`,
  })
}

export async function notifyAppointmentRefund(
  appointment: AppointmentRef,
  amount: number | null,
  reason?: string | null,
): Promise<void> {
  await dispatchNotification({
    event: 'REFUND_UPDATE',
    customer: appointmentCustomer(appointment),
    context: appointmentContext(appointment, { amount, reason: reason ?? null }),
    dedupeKey: `booking:${appointment.id}:REFUND_UPDATE`,
  })
}

// ─── Shop orders ────────────────────────────────────────────────────────────

export async function notifyOrderConfirmation(order: OrderRef, fallbackId?: number | null): Promise<void> {
  await dispatchNotification({
    event: 'ORDER_CONFIRMATION',
    customer: orderCustomer(order, fallbackId),
    context: orderContext(order),
    dedupeKey: `order:${order.id}:ORDER_CONFIRMATION`,
  })
}

export async function notifyOrderStatus(
  order: OrderRef,
  status: string,
  trackingInfo?: string | null,
): Promise<void> {
  await dispatchNotification({
    event: 'ORDER_STATUS',
    customer: orderCustomer(order),
    context: orderContext(order, { status, trackingInfo: trackingInfo ?? null }),
    dedupeKey: `order:${order.id}:ORDER_STATUS:${status}`,
  })
}

export async function notifyOrderCancelled(order: OrderRef, reason?: string | null): Promise<void> {
  await dispatchNotification({
    event: 'ORDER_CANCELLED',
    customer: orderCustomer(order),
    context: orderContext(order, { reason: reason ?? null }),
    dedupeKey: `order:${order.id}:ORDER_CANCELLED`,
  })
}

export async function notifyOrderPaymentSuccess(order: OrderRef): Promise<void> {
  await dispatchNotification({
    event: 'PAYMENT_SUCCESS',
    customer: orderCustomer(order),
    context: orderContext(order, { paymentStatus: 'PAID', status: order.status ?? null }),
    dedupeKey: `order:${order.id}:PAYMENT_SUCCESS`,
  })
}

export async function notifyOrderPaymentFailed(order: OrderRef, reason?: string | null): Promise<void> {
  await dispatchNotification({
    event: 'PAYMENT_FAILED',
    customer: orderCustomer(order),
    context: orderContext(order, { reason: reason ?? null }),
    dedupeKey: `order:${order.id}:PAYMENT_FAILED`,
  })
}

export async function notifyRefundUpdate(
  order: OrderRef,
  amount: number | null,
  options: { reason?: string | null; status?: string | null } = {},
): Promise<void> {
  await dispatchNotification({
    event: 'REFUND_UPDATE',
    customer: orderCustomer(order),
    context: orderContext(order, {
      amount,
      reason: options.reason ?? null,
      status: options.status ?? order.status ?? null,
    }),
    dedupeKey: `order:${order.id}:REFUND_UPDATE:${options.status ?? 'UPDATE'}`,
  })
}
