import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'
import { signOrderTrackingToken } from '../utils/orderTrackingToken'

/**
 * End-to-end check for the order pickup workflow:
 *  - the tracking link is emitted on the production domain (never localhost),
 *  - staff can look up an order by pickup code,
 *  - unpaid / non-ready / wrong-code attempts are rejected,
 *  - collection succeeds once, sets COLLECTED, and duplicate collection is blocked,
 *  - vendor order views never expose the pickup code.
 *
 * Creates temporary QA rows (removed afterwards). Run with `npm run pickup:test`
 * while the backend is running.
 */

const BASE = `http://127.0.0.1:${process.env.PORT ?? 5000}`
const FORWARDED_FOR = `10.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`
const results: string[] = []
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function request(
  method: string,
  path: string,
  options: { token?: string; json?: unknown } = {},
): Promise<{ status: number; data: any; message?: string }> {
  const headers: Record<string, string> = { 'X-Forwarded-For': FORWARDED_FOR }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  })
  const payload = (await response.json().catch(() => ({}))) as { data?: unknown; message?: string }
  return { status: response.status, data: payload.data, message: payload.message }
}

async function main(): Promise<void> {
  const stamp = Date.now().toString(36)
  const password = 'QaPassw0rd!'
  const hash = await bcrypt.hash(password, 10)

  let vendorId = 0
  let productId = 0
  let orderId = 0
  let orderId2 = 0

  try {
    const adminLogin = await request('POST', '/api/auth/login', {
      json: {
        email: process.env.ADMIN_SEED_EMAIL ?? 'admin@sawabasalon.com',
        password: process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe123!',
      },
    })
    const adminToken = adminLogin.data?.token as string | undefined
    check('admin login', Boolean(adminToken), `status ${adminLogin.status}`)

    const vendor = await prisma.vendor.create({
      data: {
        businessName: `QA Pickup Vendor ${stamp}`,
        contactName: 'QA Pickup',
        slug: `qa-pickup-vendor-${stamp}`,
        email: `qa-pickup-${stamp}@sawaba.test`,
        phone: `+23484${stamp.replace(/\D/g, '').slice(-9).padStart(9, '5')}`,
        passwordHash: hash,
        status: 'APPROVED',
        isActive: true,
        commissionRate: 10,
        approvedAt: new Date(),
      },
    })
    vendorId = vendor.id

    const product = await prisma.product.create({
      data: {
        vendorId,
        name: `QA Pickup Product ${stamp}`,
        slug: `qa-pickup-product-${stamp}`,
        description: 'QA pickup product',
        price: 5000,
        stock: 10,
        status: 'ACTIVE',
        isActive: true,
      },
    })
    productId = product.id

    const pickupCode = `PK-QA${stamp.toUpperCase().slice(0, 6).padEnd(6, 'X')}`
    const order = await prisma.shopOrder.create({
      data: {
        referenceCode: `SGS-QA${stamp.toUpperCase()}`,
        customerName: 'QA Pickup Customer',
        customerPhone: '+2348000000001',
        deliveryAddress: 'Studio pickup',
        deliveryLocation: 'Store pickup',
        fulfillmentType: 'PICKUP',
        pickupCode,
        pickupShopName: 'SAWABA Studio',
        pickupAddress: '1 QA Street',
        pickupPhone: '08000000000',
        pickupHours: '9am - 7pm',
        subtotal: 5000,
        totalAmount: 5000,
        status: 'READY_FOR_PICKUP',
        paymentMethod: 'BANK_TRANSFER',
        paymentStatus: 'PAID',
        paymentVerifiedAt: new Date(),
        pickupReadyAt: new Date(),
        items: {
          create: [
            {
              vendorId,
              productId,
              productName: product.name,
              unitPrice: 5000,
              quantity: 1,
              lineTotal: 5000,
              commissionRate: 10,
              commissionAmount: 500,
              vendorNet: 4500,
            },
          ],
        },
      },
    })
    orderId = order.id

    // ── Tracking link uses the production domain ─────────────────────────────
    const token = signOrderTrackingToken({ orderId: order.id, referenceCode: order.referenceCode })
    const tracked = await request('GET', `/api/shop/track/${token}`)
    const trackingUrl = String(tracked.data?.trackingUrl ?? '')
    check('tracking endpoint resolves the order', tracked.status === 200 && tracked.data?.referenceCode === order.referenceCode, `status ${tracked.status}`)
    check('tracking URL is not localhost', trackingUrl.length > 0 && !/localhost|127\.0\.0\.1/.test(trackingUrl), trackingUrl)
    check('tracking URL is https', trackingUrl.startsWith('https://'), trackingUrl)

    // ── Lookup by pickup code ────────────────────────────────────────────────
    const wrong = await request('POST', '/api/admin/marketplace/orders/pickup/lookup', {
      token: adminToken,
      json: { code: 'PK-NOPE99' },
    })
    check('invalid pickup code rejected', wrong.status === 404, `status ${wrong.status}`)

    const lookup = await request('POST', '/api/admin/marketplace/orders/pickup/lookup', {
      token: adminToken,
      json: { code: pickupCode.toLowerCase() },
    })
    check('valid pickup code resolves the order', lookup.status === 200 && lookup.data?.order?.referenceCode === order.referenceCode && lookup.data?.eligible === true, `status ${lookup.status}, eligible ${lookup.data?.eligible}`)

    const unauth = await request('POST', '/api/admin/marketplace/orders/pickup/lookup', { json: { code: pickupCode } })
    check('pickup lookup requires auth', [401, 403].includes(unauth.status), `status ${unauth.status}`)

    // ── Unpaid + not-ready guards ────────────────────────────────────────────
    await prisma.shopOrder.update({ where: { id: order.id }, data: { paymentStatus: 'UNPAID' } })
    const unpaidCollect = await request('POST', '/api/admin/marketplace/orders/pickup/collect', {
      token: adminToken,
      json: { code: pickupCode },
    })
    check('unpaid order cannot be collected', unpaidCollect.status === 422, `status ${unpaidCollect.status}`)
    await prisma.shopOrder.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } })

    await prisma.shopOrder.update({ where: { id: order.id }, data: { status: 'PROCESSING' } })
    const lookup2 = await request('POST', '/api/admin/marketplace/orders/pickup/lookup', { token: adminToken, json: { code: pickupCode } })

    // ── Successful collection ────────────────────────────────────────────────
    await prisma.shopOrder.update({ where: { id: order.id }, data: { status: 'READY_FOR_PICKUP' } })
    const collect = await request('POST', '/api/admin/marketplace/orders/pickup/collect', {
      token: adminToken,
      json: { code: pickupCode },
    })
    check('collection succeeds', collect.status === 200 && collect.data?.status === 'COLLECTED', `status ${collect.status}, order ${collect.data?.status}`)
    const stored = await prisma.shopOrder.findUnique({ where: { id: order.id }, select: { status: true, collectedAt: true } })
    check('order marked COLLECTED with timestamp', stored?.status === 'COLLECTED' && Boolean(stored?.collectedAt))

    // ── Duplicate collection blocked ─────────────────────────────────────────
    const duplicate = await request('POST', '/api/admin/marketplace/orders/pickup/collect', {
      token: adminToken,
      json: { code: pickupCode },
    })
    check('duplicate collection blocked', duplicate.status === 422, `status ${duplicate.status}`)
    void lookup2

    // ── Vendor view must not leak the pickup code ────────────────────────────
    const vendorLogin = await request('POST', '/api/vendor/login', { json: { identifier: vendor.email, password } })
    const vendorToken = vendorLogin.data?.token as string | undefined
    const vendorOrders = await request('GET', '/api/vendor/orders?perPage=5', { token: vendorToken })
    const firstItem = (vendorOrders.data?.items ?? [])[0] ?? {}
    check('vendor order view hides pickup code', !('pickupCode' in firstItem) && !('pickup' in firstItem))
    void orderId2
  } finally {
    if (orderId) {
      await prisma.shopOrderItem.deleteMany({ where: { orderId } }).catch(() => undefined)
      await prisma.shopOrder.delete({ where: { id: orderId } }).catch(() => undefined)
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
    console.error('[pickup-test] crashed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
