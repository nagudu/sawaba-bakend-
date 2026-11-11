import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'

/**
 * Creates the demo identities and data used for the promotional shoot:
 *  - a customer, a vendor (with bank details) and a portal barber,
 *  - two vendor products (real images copied from existing catalogue rows),
 *  - two paid orders (one out-for-delivery, one ready-for-pickup) with ledger rows.
 *
 * Idempotent: existing promo rows are removed first. Run with `npm run promo:seed`.
 */

const PASSWORD_CUSTOMER = 'PromoCustomer1!'
const PASSWORD_VENDOR = 'PromoVendor1!'
const PASSWORD_BARBER = 'PromoBarber1!'

async function cleanup(): Promise<void> {
  const vendors = await prisma.vendor.findMany({ where: { slug: { startsWith: 'promo-' } }, select: { id: true } })
  const vendorIds = vendors.map((v) => v.id)
  if (vendorIds.length > 0) {
    const orders = await prisma.shopOrder.findMany({
      where: { items: { some: { vendorId: { in: vendorIds } } } },
      select: { id: true },
    })
    const orderIds = orders.map((o) => o.id)
    if (orderIds.length > 0) {
      await prisma.commissionLedger.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined)
      await prisma.shopOrderItem.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined)
      await prisma.shopOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => undefined)
    }
    await prisma.product.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => undefined)
    await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } }).catch(() => undefined)
  }
  await prisma.barber.deleteMany({ where: { slug: { startsWith: 'promo-' } } }).catch(() => undefined)
  await prisma.customer.deleteMany({ where: { email: { startsWith: 'promo.' } } }).catch(() => undefined)
}

async function main(): Promise<void> {
  await cleanup()

  const hash = async (value: string) => bcrypt.hash(value, 10)

  const customer = await prisma.customer.create({
    data: {
      fullName: 'Ada Obi',
      email: 'promo.customer@sawaba.test',
      phone: '+2348090000001',
      passwordHash: await hash(PASSWORD_CUSTOMER),
      isActive: true,
    },
  })

  const vendor = await prisma.vendor.create({
    data: {
      businessName: 'Sawaba Demo Store',
      contactName: 'Ifeanyi Demo',
      slug: 'promo-demo-store',
      email: 'promo.vendor@sawaba.test',
      phone: '+2348090000002',
      passwordHash: await hash(PASSWORD_VENDOR),
      status: 'APPROVED',
      isActive: true,
      commissionRate: 12,
      approvedAt: new Date(),
      address: '12 Adeola Odeku Street, Victoria Island, Lagos',
      bankName: 'Guaranty Trust Bank',
      bankAccountName: 'Sawaba Demo Store',
      bankAccountNumber: '0123456789',
    },
  })

  await prisma.barber.create({
    data: {
      name: 'Demo Barber',
      slug: 'promo-demo-barber',
      email: 'promo.barber@sawaba.test',
      phone: '+2348090000003',
      passwordHash: await hash(PASSWORD_BARBER),
      isActive: true,
      portalEnabled: true,
      biography: 'Senior barber at Sawaba Grooming Studio.',
    },
  })

  const sampleImages = await prisma.productImage.findMany({
    where: { mediaType: 'IMAGE' },
    orderBy: { id: 'asc' },
    take: 4,
    select: { url: true },
  })
  const imageUrls = sampleImages.map((row) => row.url)

  const products = [
    { name: 'Beard Grooming Kit', price: 18500, description: 'Complete beard care set — oil, balm and a precision trimmer.', brand: 'Sawaba' },
    { name: 'Premium Hair Pomade', price: 6500, description: 'Strong-hold, water-based pomade with a matte finish.', brand: 'Sawaba' },
  ]

  const createdProducts: number[] = []
  const createdItemMeta: Array<{ productId: number; name: string; price: number; image: string | null }> = []

  for (let index = 0; index < products.length; index += 1) {
    const item = products[index]
    const image = imageUrls[index] ?? null
    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        name: item.name,
        slug: `promo-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        description: item.description,
        brand: item.brand,
        price: item.price,
        stock: 40,
        status: 'ACTIVE',
        isActive: true,
        approvedAt: new Date(),
        ...(image
          ? { images: { create: [{ url: image, sortOrder: 0, isPrimary: true, mediaType: 'IMAGE', alt: item.name }] } }
          : {}),
      },
    })
    createdProducts.push(product.id)
    createdItemMeta.push({ productId: product.id, name: item.name, price: item.price, image })
  }

  async function createOrder(index: number, kind: 'DELIVERY' | 'PICKUP', status: string) {
    const meta = createdItemMeta[index % createdItemMeta.length]
    const total = meta.price
    const order = await prisma.shopOrder.create({
      data: {
        referenceCode: `SGS-PROMO${index + 1}`,
        customerId: customer.id,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        deliveryAddress: kind === 'PICKUP' ? 'Sawaba Grooming Studio, Victoria Island' : '12 Adeola Odeku Street, Victoria Island',
        deliveryLocation: kind === 'PICKUP' ? 'Store pickup' : 'Victoria Island',
        fulfillmentType: kind,
        ...(kind === 'PICKUP'
          ? {
              pickupCode: `PK-PROMO${index + 1}`,
              pickupShopName: 'Sawaba Grooming Studio',
              pickupAddress: '12 Adeola Odeku Street, Victoria Island, Lagos',
              pickupPhone: '08012345678',
              pickupHours: 'Mon–Sat, 9am – 8pm',
              pickupReadyAt: new Date(),
            }
          : { estimatedDeliveryAt: new Date(Date.now() + 172800000), outForDeliveryAt: new Date() }),
        subtotal: total,
        totalAmount: total,
        status,
        paymentMethod: 'BANK_TRANSFER',
        paymentStatus: 'PAID',
        paymentVerifiedAt: new Date(),
        items: {
          create: [
            {
              vendorId: vendor.id,
              productId: meta.productId,
              productName: meta.name,
              productImage: meta.image,
              unitPrice: meta.price,
              quantity: 1,
              lineTotal: meta.price,
              commissionRate: 12,
              commissionAmount: Math.round(meta.price * 0.12),
              vendorNet: meta.price - Math.round(meta.price * 0.12),
              status: 'PREPARING',
            },
          ],
        },
      },
      include: { items: { select: { id: true } } },
    })

    await prisma.commissionLedger.create({
      data: {
        orderId: order.id,
        orderItemId: order.items[0].id,
        vendorId: vendor.id,
        productId: meta.productId,
        quantity: 1,
        salePrice: total,
        commissionRate: 12,
        commissionAmount: Math.round(meta.price * 0.12),
        vendorNet: meta.price - Math.round(meta.price * 0.12),
        settlementStatus: index === 0 ? 'RELEASED' : 'PENDING',
        releasedAt: index === 0 ? new Date() : null,
      },
    })
    return order
  }

  await createOrder(0, 'DELIVERY', 'OUT_FOR_DELIVERY')
  await createOrder(1, 'PICKUP', 'READY_FOR_PICKUP')

  console.log('PROMO DEMO ACCOUNTS')
  console.log(`customer  ${customer.email}  ${PASSWORD_CUSTOMER}`)
  console.log(`vendor    ${vendor.email}  ${PASSWORD_VENDOR}`)
  console.log(`barber    promo.barber@sawaba.test  ${PASSWORD_BARBER}`)
  console.log(`products  ${createdProducts.join(', ')}`)
}

const cleanupOnly = process.argv.includes('--cleanup')

;(cleanupOnly
  ? cleanup().then(() => console.log('[promo-seed] demo data removed'))
  : main()
)
  .catch((error) => {
    console.error('[promo-seed] failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
