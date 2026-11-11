import { prisma } from '../config/database'
import { NotFoundError } from '../utils/errors'

/**
 * Customer in-app notification inbox. Only IN_APP rows are returned: external
 * delivery rows (email/SMS/WhatsApp) are an implementation detail and are
 * surfaced to admins, never to the customer.
 */

export interface CustomerNotificationView {
  id: number
  type: string
  channel: 'IN_APP'
  title: string
  message: string
  orderId: number | null
  orderReference: string | null
  readAt: string | null
  createdAt: string
}

export async function listCustomerNotifications(
  customerId: number,
  query: { page?: number; perPage?: number; unreadOnly?: boolean },
): Promise<{
  items: CustomerNotificationView[]
  total: number
  page: number
  perPage: number
  unreadCount: number
}> {
  const page = Math.max(1, query.page ?? 1)
  const perPage = Math.min(50, Math.max(1, query.perPage ?? 20))
  const where = {
    customerId,
    channel: 'IN_APP' as const,
    ...(query.unreadOnly ? { readAt: null } : {}),
  }

  const [rows, total, unreadCount] = await Promise.all([
    prisma.customerNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.customerNotification.count({ where }),
    prisma.customerNotification.count({
      where: { customerId, channel: 'IN_APP', readAt: null },
    }),
  ])

  // Attach the human order number without exposing internal relation details.
  const orderIds = [
    ...new Set(rows.map((row) => row.orderId).filter((id): id is number => typeof id === 'number')),
  ]
  const orders =
    orderIds.length > 0
      ? await prisma.shopOrder.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, referenceCode: true },
        })
      : []
  const referenceById = new Map(orders.map((order) => [order.id, order.referenceCode]))

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      channel: 'IN_APP' as const,
      title: row.title,
      message: row.message,
      orderId: row.orderId,
      orderReference: row.orderId ? referenceById.get(row.orderId) ?? null : null,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    perPage,
    unreadCount,
  }
}

export async function markCustomerNotificationRead(
  customerId: number,
  notificationId: number,
): Promise<void> {
  const result = await prisma.customerNotification.updateMany({
    where: { id: notificationId, customerId, channel: 'IN_APP' },
    data: { readAt: new Date() },
  })
  if (result.count === 0) throw new NotFoundError('Notification not found.')
}

export async function markAllCustomerNotificationsRead(customerId: number): Promise<number> {
  const result = await prisma.customerNotification.updateMany({
    where: { customerId, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date() },
  })
  return result.count
}

export async function getCustomerUnreadCount(customerId: number): Promise<number> {
  return prisma.customerNotification.count({
    where: { customerId, channel: 'IN_APP', readAt: null },
  })
}
