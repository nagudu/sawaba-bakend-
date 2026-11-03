import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'

/**
 * End-to-end check for role-based authentication:
 *  - each of the four roles can log in and `/api/auth/session` resolves the
 *    correct role from that token,
 *  - tokens cannot access another role's area,
 *  - tampered tokens are rejected.
 *
 * Creates temporary QA accounts (deleted afterwards). Run with `npm run auth:test`
 * while the backend is running.
 */

const BASE = `http://127.0.0.1:${process.env.PORT ?? 5000}`
// The API trusts the first proxy hop, so a unique forwarded IP keeps this
// run's logins in their own rate-limit bucket.
const FORWARDED_FOR = `10.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`
const results: string[] = []
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function post(path: string, body: unknown): Promise<{ status: number; data: any; message?: string }> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': FORWARDED_FOR },
    body: JSON.stringify(body),
  })
  const json = (await response.json().catch(() => ({}))) as { data?: unknown; message?: string }
  return { status: response.status, data: json.data, message: json.message }
}

async function get(path: string, token?: string): Promise<{ status: number; data: any }> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'X-Forwarded-For': FORWARDED_FOR, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  const json = (await response.json().catch(() => ({}))) as { data?: unknown }
  return { status: response.status, data: json.data }
}

async function main(): Promise<void> {
  const stamp = Date.now().toString(36)
  const password = 'QaPassw0rd!'
  const hash = await bcrypt.hash(password, 10)

  let customerId = 0
  let vendorId = 0
  let barberId = 0

  try {
    // ── Admin ────────────────────────────────────────────────────────────────
    const adminLogin = await post('/api/auth/login', {
      email: process.env.ADMIN_SEED_EMAIL ?? 'admin@sawabasalon.com',
      password: process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe123!',
    })
    const adminToken = adminLogin.data?.token as string | undefined
    check('admin login', Boolean(adminToken), `status ${adminLogin.status}`)

    const adminSession = await get('/api/auth/session', adminToken)
    check('session(admin) → ADMIN', adminSession.data?.role === 'ADMIN', String(adminSession.data?.role ?? adminSession.status))

    // ── QA accounts ──────────────────────────────────────────────────────────
    const customer = await prisma.customer.create({
      data: {
        fullName: 'QA Session Customer',
        email: `qa-session-${stamp}@sawaba.test`,
        phone: `+23480${stamp.replace(/\D/g, '').slice(-9).padStart(9, '1')}`,
        passwordHash: hash,
        isActive: true,
      },
    })
    customerId = customer.id

    const vendor = await prisma.vendor.create({
      data: {
        businessName: `QA Session Vendor ${stamp}`,
        contactName: 'QA Vendor',
        slug: `qa-session-vendor-${stamp}`,
        email: `qa-vendor-${stamp}@sawaba.test`,
        phone: `+23481${stamp.replace(/\D/g, '').slice(-9).padStart(9, '2')}`,
        passwordHash: hash,
        status: 'APPROVED',
        isActive: true,
        commissionRate: 10,
        approvedAt: new Date(),
      },
    })
    vendorId = vendor.id

    const barber = await prisma.barber.create({
      data: {
        name: `QA Session Barber ${stamp}`,
        slug: `qa-session-barber-${stamp}`,
        email: `qa-barber-${stamp}@sawaba.test`,
        phone: `+23482${stamp.replace(/\D/g, '').slice(-9).padStart(9, '3')}`,
        passwordHash: hash,
        isActive: true,
        portalEnabled: true,
      },
    })
    barberId = barber.id

    // ── Logins ───────────────────────────────────────────────────────────────
    const custLogin = await post('/api/account/login', { identifier: customer.email, password })
    const custToken = custLogin.data?.token as string | undefined
    check('customer login', Boolean(custToken), `status ${custLogin.status}`)
    const custSession = await get('/api/auth/session', custToken)
    check('session(customer) → CUSTOMER', custSession.data?.role === 'CUSTOMER', String(custSession.data?.role ?? custSession.status))

    const vendorLogin = await post('/api/vendor/login', { identifier: vendor.email, password })
    const vendorToken = vendorLogin.data?.token as string | undefined
    check('vendor login', Boolean(vendorToken), `status ${vendorLogin.status}`)
    const vendorSession = await get('/api/auth/session', vendorToken)
    check('session(vendor) → VENDOR', vendorSession.data?.role === 'VENDOR', String(vendorSession.data?.role ?? vendorSession.status))

    const barberLogin = await post('/api/barber/auth/login', { identifier: barber.email, password })
    const barberToken = barberLogin.data?.token as string | undefined
    check('barber login', Boolean(barberToken), `status ${barberLogin.status}`)
    const barberSession = await get('/api/auth/session', barberToken)
    check('session(barber) → BARBER', barberSession.data?.role === 'BARBER', String(barberSession.data?.role ?? barberSession.status))

    // ── Authorization boundaries ─────────────────────────────────────────────
    const adminOnly = '/api/admin/marketplace/products?perPage=1'
    check('customer blocked from admin', [401, 403].includes((await get(adminOnly, custToken)).status))
    check('vendor blocked from admin', [401, 403].includes((await get(adminOnly, vendorToken)).status))
    check('barber blocked from admin', [401, 403].includes((await get(adminOnly, barberToken)).status))
    check('admin token blocked from customer area', [401, 403].includes((await get('/api/account/me', adminToken)).status))
    check(
      'tampered token rejected',
      (await get('/api/auth/session', `${adminToken ?? 'x'}tampered`)).status === 401,
    )
    check('no token rejected', (await get('/api/auth/session')).status === 401)
  } finally {
    if (barberId) await prisma.barber.delete({ where: { id: barberId } }).catch(() => undefined)
    if (vendorId) await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => undefined)
    if (customerId) await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined)
  }
}

main()
  .then(() => {
    console.log(results.join('\n'))
    console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`)
    if (failures > 0) process.exitCode = 1
  })
  .catch((error) => {
    console.error('[auth-test] crashed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
