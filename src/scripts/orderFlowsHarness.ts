import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'

/**
 * Verifies the SEPARATE delivery and pickup fulfilment flows:
 *  - delivery: PROCESSING → OUT_FOR_DELIVERY → DELIVERED (with timestamps),
 *  - pickup: PROCESSING → READY_FOR_PICKUP → COLLECTED,
 *  - cross-flow statuses are rejected (pickup can't be shipped/delivered,
 *    delivery can't be marked ready-for-pickup/collected),
 *  - vendors cannot "ship" a pickup item.
 *
 * Run with `npm run flows:test` while the backend is running.
 */

const BASE = `http://127.0.0.1:${process.env.PORT ?? 5000}`
const FORWARDED_FOR = `10.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`
const results: string[] = []
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function request(method: string, path: string, options: { token?: string; json?: unknown } = {}) {
  const headers: Record<string, string> = { 'X-Forwarded-For': FORWARDED_FOR }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  })
  const payload = (await response.json().catch(() => ({}))) as { data?: any; message?: string }
  return { status: response.status, data: payload.data, message: payload.message }
}

async function main(): Promise<void> {
  const stamp = Date.now().toString(36)
  const password = 'QaPassw0rd!'
  const hash = await bcrypt.hash(password, 10)
  const createdOrders: number[] = []
  let vendorId = 0
  let productId = 0

  try {
    const adminToken = (await request('POST', '/api/auth/login', {
      json: {
        email: process.env.ADMIN_SEED_EMAIL ?? 'admin@sawabasalon.com',
        password: process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe123!',
      },
    })).data?.token as string | undefined
    check('admin login', Boolean(adminToken))

    const vendor = await prisma.vendor.create({
      data: {
        businessName: `QA Flows Vendor ${stamp}`,
        contactName: 'QA Flows',
        slug: `qa-flows-vendor-${stamp}`,
        email: `qa-flows-${stamp}@sawaba.test`,
        phone: `+23485${stamp.replace(/\D/g, '').slice(-9).padStart(9, '6')}`,
        passwordHash: hash,
        status: 'APPROVED',
        isActive: true,
        commissionRate: 10,
        approvedAt: new Date(),
      },
    })
    vendorId = vendor.id
    const product = await prisma.product.create({
      data: { vendorId, name: `QA Flows Product ${stamp}`, slug: `qa-flows-product-${stamp}`, description: 'QA flows', price: 4000, stock: 20, status: 'ACTIVE', isActive: true },
    })
    productId = product.id

    async function makeOrder(kind: 'DELIVERY' | 'PICKUP', index: number, itemStatus = 'PREPARING') {
      const order = await prisma.shopOrder.create({
        data: {
          referenceCode: `SGS-QF${stamp.toUpperCase()}${index}`,
          customerName: 'QA Flows Customer',
          customerPhone: '+2348000000002',
          deliveryAddress: kind === 'PICKUP' ? 'Studio pickup' : '5 QA Avenue',
          deliveryLocation: kind === 'PICKUP' ? 'Store pickup' : 'Wuse',
          fulfillmentType: kind,
          ...(kind === 'PICKUP'
            ? { pickupCode: `PK-QF${stamp.toUpperCase().slice(0, 4)}${index}`, pickupShopName: 'SAWABA Studio', pickupAddress: '1 QA Street' }
            : {}),
          subtotal: 4000,
          totalAmount: 4000,
          status: 'PAYMENT_CONFIRMED',
          paymentMethod: 'BANK_TRANSFER',
          paymentStatus: 'PAID',
          paymentVerifiedAt: new Date(),
          items: {
            create: [
              { vendorId, productId, productName: product.name, unitPrice: 4000, quantity: 1, lineTotal: 4000, commissionRate: 10, commissionAmount: 400, vendorNet: 3600, status: itemStatus },
            ],
          },
        },
        include: { items: { select: { id: true } } },
      })
      createdOrders.push(order.id)
      return order
    }

    // ── Delivery flow ────────────────────────────────────────────────────────
    const delivery = await makeOrder('DELIVERY', 0)
    const move = (reference: string, status: string) =>
      request('PATCH', `/api/admin/marketplace/orders/${reference}/status`, { token: adminToken, json: { status } })

    check('delivery → PROCESSING', (await move(delivery.referenceCode, 'PROCESSING')).status === 200)
    const outForDelivery = await move(delivery.referenceCode, 'OUT_FOR_DELIVERY')
    check('delivery → OUT_FOR_DELIVERY', outForDelivery.status === 200 && outForDelivery.data?.status === 'OUT_FOR_DELIVERY', `status ${outForDelivery.status}`)
    const deliveryRow = await prisma.shopOrder.findUnique({ where: { id: delivery.id }, select: { outForDeliveryAt: true } })
    check('OUT_FOR_DELIVERY timestamp set', Boolean(deliveryRow?.outForDeliveryAt))
    const delivered = await move(delivery.referenceCode, 'DELIVERED')
    check('delivery → DELIVERED', delivered.status === 200 && delivered.data?.status === 'DELIVERED', `status ${delivered.status}`)
    const deliveryRow2 = await prisma.shopOrder.findUnique({ where: { id: delivery.id }, select: { deliveredAt: true } })
    check('DELIVERED timestamp set', Boolean(deliveryRow2?.deliveredAt))

    // Delivery order must not accept pickup statuses.
    const delivery2 = await makeOrder('DELIVERY', 1)
    check('delivery rejects READY_FOR_PICKUP', (await move(delivery2.referenceCode, 'READY_FOR_PICKUP')).status === 422)
    check('delivery rejects COLLECTED', (await move(delivery2.referenceCode, 'COLLECTED')).status === 422)

    // ── Pickup flow ──────────────────────────────────────────────────────────
    const pickup = await makeOrder('PICKUP', 2)
    check('pickup → PROCESSING', (await move(pickup.referenceCode, 'PROCESSING')).status === 200)
    const readyForPickup = await move(pickup.referenceCode, 'READY_FOR_PICKUP')
    check('pickup → READY_FOR_PICKUP', readyForPickup.status === 200 && readyForPickup.data?.status === 'READY_FOR_PICKUP', `status ${readyForPickup.status}`)
    const pickupRow = await prisma.shopOrder.findUnique({ where: { id: pickup.id }, select: { pickupReadyAt: true, pickupCode: true } })
    check('pickupReadyAt timestamp + code', Boolean(pickupRow?.pickupReadyAt) && Boolean(pickupRow?.pickupCode))

    // Pickup order must not accept delivery statuses.
    check('pickup rejects OUT_FOR_DELIVERY', (await move(pickup.referenceCode, 'OUT_FOR_DELIVERY')).status === 422)
    check('pickup rejects DELIVERED', (await move(pickup.referenceCode, 'DELIVERED')).status === 422)
    check('pickup rejects SHIPPED', (await move(pickup.referenceCode, 'SHIPPED')).status === 422)

    // Vendor cannot ship a pickup item.
    const vendorToken = (await request('POST', '/api/vendor/login', { json: { identifier: vendor.email, password } })).data?.token as string | undefined
    const pickupItemId = (await prisma.shopOrderItem.findFirst({ where: { orderId: pickup.id }, select: { id: true } }))?.id
    if (vendorToken && pickupItemId) {
      const shipAttempt = await request('PATCH', `/api/vendor/orders/items/${pickupItemId}`, { token: vendorToken, json: { status: 'SHIPPED' } })
      check('vendor cannot ship a pickup item', shipAttempt.status === 422, `status ${shipAttempt.status}`)
    }

    // ── Collect the pickup order ─────────────────────────────────────────────
    const collect = await request('POST', '/api/admin/marketplace/orders/pickup/collect', { token: adminToken, json: { code: pickupRow?.pickupCode } })
    check('pickup → COLLECTED via code', collect.status === 200 && collect.data?.status === 'COLLECTED', `status ${collect.status}`)
  } finally {
    for (const id of createdOrders) {
      await prisma.shopOrderItem.deleteMany({ where: { orderId: id } }).catch(() => undefined)
      await prisma.shopOrder.delete({ where: { id } }).catch(() => undefined)
    }
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined)
    if (vendorId) await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => undefined)
  }
}

main()
  .then(() => {
    console.log(results.join('\n'))
    console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`)
    if (failures > 0) process.exitCode = 1
  })
  .catch((error) => {
    console.error('[flows-test] crashed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
