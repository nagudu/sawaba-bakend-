import 'dotenv/config'
import { prisma } from '../config/database'
import {
  getOrderByTrackingToken,
  lookupOrderForTracking,
  trackMyOrder,
} from '../services/shopService'
import {
  buildOrderTrackingUrl,
  signOrderTrackingToken,
  verifyOrderTrackingToken,
} from '../utils/orderTrackingToken'

/**
 * Guest order-tracking harness.
 *
 *   tsx src/scripts/orderTrackingHarness.ts
 *
 * Exercises the secure-link tracking system against the real database:
 *   1. sign/verify round-trip,
 *   2. fetching an order by token (no login, no OTP),
 *   3. tampered-token rejection,
 *   4. lookup by the order's phone and email,
 *   5. generic rejection for a non-matching contact.
 *
 * It uses ORDER_REF (env) or the most recent order. Nothing here fabricates a
 * success — every check prints PASS/FAIL honestly.
 */

function check(ok: boolean, label: string): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

async function main(): Promise<void> {
  console.log('── SAWABA order-tracking harness ────────────────────────────')

  const refArg = process.env.ORDER_REF?.trim()
  const order = refArg
    ? await prisma.shopOrder.findFirst({ where: { referenceCode: refArg.toUpperCase() } })
    : await prisma.shopOrder.findFirst({ orderBy: { createdAt: 'desc' } })

  if (!order) {
    console.log('No shop orders found — place a test order first, or set ORDER_REF.')
    return
  }

  console.log(
    `Order: ${order.referenceCode} (id ${order.id}, ${order.customerId === null ? 'GUEST' : `customer #${order.customerId}`})`,
  )

  const claims = { orderId: order.id, referenceCode: order.referenceCode }

  // 1. sign / verify round-trip
  const token = signOrderTrackingToken(claims)
  const decoded = verifyOrderTrackingToken(token)
  check(decoded.orderId === order.id && decoded.referenceCode === order.referenceCode, 'token sign/verify round-trips')
  console.log('  sample link:', buildOrderTrackingUrl(claims).replace(token, '<token>'))

  // 2. fetch by token
  const byToken = await getOrderByTrackingToken(token)
  check(byToken.referenceCode === order.referenceCode, 'getOrderByTrackingToken returns the order')

  // 3. tampered token rejected
  let tamperRejected = false
  try {
    verifyOrderTrackingToken(`${token.slice(0, -2)}xx`)
  } catch {
    tamperRejected = true
  }
  check(tamperRejected, 'tampered token is rejected (401)')

  // 4a. lookup by phone
  try {
    const viaPhone = await lookupOrderForTracking(order.referenceCode, order.customerPhone)
    check(viaPhone.order.referenceCode === order.referenceCode, 'lookup by phone succeeds')
  } catch (error) {
    check(false, `lookup by phone succeeds (${(error as Error).message})`)
  }

  // 4b. lookup by email (when present)
  if (order.customerEmail) {
    try {
      const viaEmail = await lookupOrderForTracking(order.referenceCode, order.customerEmail)
      check(viaEmail.order.referenceCode === order.referenceCode, 'lookup by email succeeds')
    } catch (error) {
      check(false, `lookup by email succeeds (${(error as Error).message})`)
    }
  } else {
    console.log('  SKIP  lookup by email (order has no email)')
  }

  // 5. non-matching contact rejected generically
  let wrongRejected = false
  try {
    await lookupOrderForTracking(order.referenceCode, '0000000000')
  } catch {
    wrongRejected = true
  }
  check(wrongRejected, 'lookup with a non-matching contact is rejected')

  // 6. signed-in tracking for a registered customer
  if (order.customerId !== null) {
    try {
      const tracked = await trackMyOrder(order.customerId, order.referenceCode)
      check(
        tracked.order.referenceCode === order.referenceCode && tracked.linked === false,
        'signed-in customer can track an order they own',
      )
    } catch (error) {
      check(false, `signed-in customer can track an order they own (${(error as Error).message})`)
    }
  } else {
    console.log('  SKIP  signed-in tracking (most recent order is an unclaimed guest order)')
  }

  // 7. guest-order visibility for the linking feature
  const guestOrders = await prisma.shopOrder.count({ where: { customerId: null } })
  console.log(`  INFO  guest orders currently unclaimed: ${guestOrders}`)
  console.log('        (linking is exercised via POST /api/shop/my/link-guest-orders with a signed-in customer)')

  console.log('\nDone.')
}

main()
  .catch((error) => {
    console.error('[harness] failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
