import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'
import type { Paged } from '../types'
import {
  computeLineCommission,
  getMarketplaceSettings,
  naira,
  type CommissionBreakdown,
} from './marketplaceService'
import type {
  CartAddInput,
  CheckoutInput,
  ProductListQuery,
} from '../validators/shop'

/**
 * Public shop — catalog, guest carts, checkout and order payments.
 *
 * Money invariants (same philosophy as the booking checkout):
 *   - Prices, stock and commission are ALWAYS read from the database inside a
 *     transaction. The browser never dictates an amount.
 *   - Stock is decremented atomically inside the order transaction; overselling
 *     under concurrency is impossible (conditional update on stock >= qty).
 *   - An order is AWAITING_PAYMENT until trusted verification (admin approval
 *     of a transfer receipt, or Paystack server-side verification) flips it to
 *     PAYMENT_CONFIRMED and creates the commission ledger.
 */

const round2 = (value: number): number => Math.round(value * 100) / 100

export function generateToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex')
}

function generateReference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

// ─── Product catalog ─────────────────────────────────────────────────────────

export interface ProductListItem {
  id: number
  name: string
  slug: string
  brand: string | null
  price: number
  compareAtPrice: number | null
  stock: number
  lowStockThreshold: number
  rating: number
  reviewCount: number
  image: string | null
  vendor: { id: number; businessName: string }
  category: { id: number; name: string } | null
  createdAt: string
}

const publicProductInclude = {
  vendor: { select: { id: true, businessName: true, status: true, isActive: true } },
  category: { select: { id: true, name: true } },
  images: { orderBy: { sortOrder: 'asc' as const } },
  variations: { where: { isActive: true } },
} as const

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof publicProductInclude }>

export function serializeProductListItem(product: ProductWithRelations): ProductListItem {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice === null ? null : Number(product.compareAtPrice),
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
    rating: Number(product.rating),
    reviewCount: product.reviewCount,
    image: product.images[0]?.url ?? null,
    vendor: { id: product.vendor.id, businessName: product.vendor.businessName },
    category: product.category,
    createdAt: product.createdAt.toISOString(),
  }
}

export interface ProductDetail extends ProductListItem {
  description: string
  isActive: boolean
  status: string
  variations: Array<{
    id: number
    name: string
    value: string
    priceDelta: number
  }>
  images: Array<{ id: number; url: string; alt: string | null }>
}

export function serializeProductDetail(product: ProductWithRelations): ProductDetail {
  return {
    ...serializeProductListItem(product),
    description: product.description,
    isActive: product.isActive,
    status: product.status,
    variations: product.variations.map((variation) => ({
      id: variation.id,
      name: variation.name,
      value: variation.value,
      priceDelta: Number(variation.priceDelta),
    })),
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
    })),
  }
}

/** Public catalog — only ACTIVE products from APPROVED, active vendors. */
export async function listShopProducts(query: ProductListQuery): Promise<Paged<ProductListItem>> {
  const { offset, limit } = getPagination(query as unknown as Record<string, unknown>)

  const where: Prisma.ProductWhereInput = {
    status: 'ACTIVE',
    isActive: true,
    vendor: { status: 'APPROVED', isActive: true },
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.brand ? { brand: { equals: query.brand } } : {}),
    ...(query.vendor ? { vendorId: query.vendor } : {}),
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? {
          price: {
            ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { brand: { contains: query.search } },
            { description: { contains: query.search } },
          ],
        }
      : {}),
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    query.sort === 'price_asc'
      ? { price: 'asc' }
      : query.sort === 'price_desc'
        ? { price: 'desc' }
        : query.sort === 'rating'
          ? { rating: 'desc' }
          : query.sort === 'popular'
            ? { salesCount: 'desc' }
            : { createdAt: 'desc' }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: publicProductInclude,
      orderBy,
      skip: offset,
      take: limit,
    }),
    prisma.product.count({ where }),
  ])

  return { items: rows.map(serializeProductListItem), total, page: query.page, perPage: query.perPage }
}

export async function getShopProductBySlug(slug: string): Promise<ProductDetail> {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: publicProductInclude,
  })
  if (
    !product ||
    product.status !== 'ACTIVE' ||
    !product.isActive ||
    product.vendor.status !== 'APPROVED' ||
    !product.vendor.isActive
  ) {
    throw new NotFoundError('This product is unavailable.')
  }
  return serializeProductDetail(product)
}

export async function listShopCategories(): Promise<
  Array<{ id: number; name: string; slug: string; imageUrl: string | null; productCount: number }>
> {
  const categories = await prisma.productCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: { status: 'ACTIVE', isActive: true } } } } },
  })
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    imageUrl: category.imageUrl,
    productCount: category._count.products,
  }))
}

export async function listShopBrands(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { status: 'ACTIVE', isActive: true, brand: { not: null } },
    distinct: ['brand'],
    select: { brand: true },
    orderBy: { brand: 'asc' },
  })
  return rows.map((row) => row.brand).filter((brand): brand is string => Boolean(brand))
}

// ─── Cart ────────────────────────────────────────────────────────────────────

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
          vendor: { select: { id: true, businessName: true } },
        },
      },
      variation: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const

type CartWithItems = Prisma.ShopCartGetPayload<{ include: typeof cartInclude }>

export interface CartView {
  token: string
  items: Array<{
    id: number
    quantity: number
    product: {
      id: number
      name: string
      slug: string
      price: number
      stock: number
      image: string | null
      vendor: { id: number; businessName: string }
      status: string
    }
    variation: { id: number; name: string; value: string; priceDelta: number } | null
    unitPrice: number
    lineTotal: number
  }>
  subtotal: number
  itemCount: number
}

function serializeCart(cart: CartWithItems): CartView {
  const items = cart.items
    .filter((item) => item.product.status === 'ACTIVE' && item.product.isActive)
    .map((item) => {
      const unitPrice = round2(Number(item.product.price) + Number(item.variation?.priceDelta ?? 0))
      return {
        id: item.id,
        quantity: item.quantity,
        product: {
          id: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          price: Number(item.product.price),
          stock: item.product.stock,
          image: item.product.images[0]?.url ?? null,
          vendor: item.product.vendor,
          status: item.product.status,
        },
        variation: item.variation
          ? {
              id: item.variation.id,
              name: item.variation.name,
              value: item.variation.value,
              priceDelta: Number(item.variation.priceDelta),
            }
          : null,
        unitPrice,
        lineTotal: round2(unitPrice * item.quantity),
      }
    })
  return {
    token: cart.token,
    items,
    subtotal: round2(items.reduce((sum, item) => sum + item.lineTotal, 0)),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  }
}

async function findOrCreateCart(token?: string, customerId?: number | null): Promise<CartWithItems> {
  if (token) {
    const existing = await prisma.shopCart.findUnique({ where: { token }, include: cartInclude })
    if (existing) {
      if (customerId && !existing.customerId) {
        await prisma.shopCart.update({ where: { id: existing.id }, data: { customerId } })
      }
      return existing
    }
  }
  const created = await prisma.shopCart.create({
    data: { token: token ?? generateToken(), customerId: customerId ?? null },
    include: cartInclude,
  })
  return created
}

export async function getCart(token: string, customerId?: number | null): Promise<CartView> {
  const cart = await findOrCreateCart(token, customerId)
  return serializeCart(cart)
}

export async function addToCart(input: CartAddInput, customerId?: number | null): Promise<CartView> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { variations: true, vendor: { select: { status: true, isActive: true } } },
  })
  if (!product || product.status !== 'ACTIVE' || !product.isActive) {
    throw new NotFoundError('This product is unavailable.')
  }
  if (product.vendor.status !== 'APPROVED' || !product.vendor.isActive) {
    throw new UnprocessableError('This product is currently unavailable.')
  }

  let priceDelta = 0
  if (input.variationId) {
    const variation = product.variations.find(
      (candidate) => candidate.id === input.variationId && candidate.isActive,
    )
    if (!variation) {
      throw new NotFoundError('That product variation is unavailable.')
    }
    priceDelta = Number(variation.priceDelta)
  }
  void priceDelta

  const cart = await findOrCreateCart(input.token, customerId ?? null)

  // Existing line for the same product+variation → merge quantities.
  const existing = cart.items.find(
    (item) => item.productId === input.productId && (item.variationId ?? null) === (input.variationId ?? null),
  )
  const newQuantity = (existing?.quantity ?? 0) + input.quantity
  const availableStock = product.stock
  if (newQuantity > availableStock) {
    throw new UnprocessableError(
      availableStock === 0
        ? `"${product.name}" is out of stock.`
        : `Only ${availableStock} unit(s) of "${product.name}" are in stock.`,
    )
  }

  if (existing) {
    await prisma.shopCartItem.update({ where: { id: existing.id }, data: { quantity: newQuantity } })
  } else {
    await prisma.shopCartItem.create({
      data: {
        cartId: cart.id,
        productId: input.productId,
        variationId: input.variationId ?? null,
        quantity: input.quantity,
      },
    })
  }

  const refreshed = await prisma.shopCart.findUniqueOrThrow({
    where: { id: cart.id },
    include: cartInclude,
  })
  return serializeCart(refreshed)
}

export async function updateCartItem(
  itemId: number,
  token: string,
  quantity: number,
): Promise<CartView> {
  const cart = await prisma.shopCart.findUnique({ where: { token }, include: cartInclude })
  if (!cart) throw new NotFoundError('Cart not found.')
  const item = cart.items.find((candidate) => candidate.id === itemId)
  if (!item) throw new NotFoundError('Item not found in your cart.')

  if (quantity === 0) {
    await prisma.shopCartItem.delete({ where: { id: itemId } })
  } else {
    if (quantity > item.product.stock) {
      throw new UnprocessableError(
        item.product.stock === 0
          ? `"${item.product.name}" is out of stock.`
          : `Only ${item.product.stock} unit(s) are in stock.`,
      )
    }
    await prisma.shopCartItem.update({ where: { id: itemId }, data: { quantity } })
  }

  const refreshed = await prisma.shopCart.findUniqueOrThrow({
    where: { id: cart.id },
    include: cartInclude,
  })
  return serializeCart(refreshed)
}

export async function removeCartItem(itemId: number, token: string): Promise<CartView> {
  const cart = await prisma.shopCart.findUnique({ where: { token }, include: cartInclude })
  if (!cart) throw new NotFoundError('Cart not found.')
  const item = cart.items.find((candidate) => candidate.id === itemId)
  if (!item) throw new NotFoundError('Item not found in your cart.')

  await prisma.shopCartItem.delete({ where: { id: itemId } })
  const refreshed = await prisma.shopCart.findUniqueOrThrow({
    where: { id: cart.id },
    include: cartInclude,
  })
  return serializeCart(refreshed)
}

export async function clearCart(token: string): Promise<void> {
  const cart = await prisma.shopCart.findUnique({ where: { token } })
  if (!cart) return
  await prisma.shopCartItem.deleteMany({ where: { cartId: cart.id } })
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export interface OrderItemView {
  id: number
  vendorId: number
  vendorName: string
  productId: number
  productName: string
  productImage: string | null
  variationLabel: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  status: string
  trackingInfo: string | null
}

export interface OrderView {
  id: number
  referenceCode: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  deliveryAddress: string
  deliveryLocation: string | null
  notes: string | null
  subtotal: number
  deliveryFee: number
  discount: number
  totalAmount: number
  status: string
  paymentMethod: string | null
  paymentStatus: string
  transactionRef: string | null
  receiptUrl: string | null
  refundedAmount: number
  createdAt: string
  items: OrderItemView[]
  history?: Array<{
    id: number
    type: string
    status: string
    detail: string | null
    actorRole: string | null
    createdAt: string
  }>
  /** Payment instructions for transfer methods (bank details from settings). */
  paymentDetails?: {
    bankName: string | null
    accountName: string | null
    accountNumber: string | null
    opayAccountName: string | null
    opayAccountNumber: string | null
    instructions: string | null
    shopName: string | null
  } | null
}

const orderInclude = {
  items: {
    include: {
      vendor: { select: { id: true, businessName: true } },
    },
    orderBy: { id: 'asc' as const },
  },
} as const

type OrderWithItems = Prisma.ShopOrderGetPayload<{ include: typeof orderInclude }>

export function serializeOrder(
  order: OrderWithItems,
  paymentDetails?: OrderView['paymentDetails'],
): OrderView {
  return {
    id: order.id,
    referenceCode: order.referenceCode,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    deliveryAddress: order.deliveryAddress,
    deliveryLocation: order.deliveryLocation,
    notes: order.notes,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    discount: Number(order.discount),
    totalAmount: Number(order.totalAmount),
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    transactionRef: order.transactionRef,
    receiptUrl: order.receiptUrl,
    refundedAmount: Number(order.refundedAmount),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      vendorId: item.vendorId,
      vendorName: item.vendor.businessName,
      productId: item.productId,
      productName: item.productName,
      productImage: item.productImage,
      variationLabel: item.variationLabel,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
      status: item.status,
      trackingInfo: item.trackingInfo,
    })),
    paymentDetails,
  }
}

async function paymentDetailsFromSettings() {
  const [settings, paymentSettings] = await Promise.all([
    getMarketplaceSettings(),
    prisma.paymentSetting.findFirst(),
  ])
  void settings
  return {
    bankName: paymentSettings?.bankName ?? null,
    accountName: paymentSettings?.accountName ?? null,
    accountNumber: paymentSettings?.accountNumber ?? null,
    opayAccountName: paymentSettings?.opayAccountName ?? null,
    opayAccountNumber: paymentSettings?.opayAccountNumber ?? null,
    instructions: paymentSettings?.paymentInstructions ?? null,
    shopName: paymentSettings?.shopName ?? 'SAWABA Grooming Studio',
  }
}

export async function recordPaymentEvent(
  orderId: number,
  event: {
    type: string
    status: string
    provider?: string | null
    providerRef?: string | null
    transactionRef?: string | null
    amount?: number | null
    actorRole?: string | null
    actorId?: number | null
    detail?: string | null
    payload?: Prisma.InputJsonValue
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await tx.shopPaymentEvent.create({
    data: {
      orderId,
      type: event.type,
      status: event.status,
      provider: event.provider ?? null,
      providerRef: event.providerRef ?? event.transactionRef ?? null,
      amount: event.amount ?? null,
      actorRole: event.actorRole ?? null,
      actorId: event.actorId ?? null,
      detail: event.detail ?? null,
      payload: event.payload === undefined ? null : JSON.stringify(event.payload),
    },
  })
}

export interface CheckoutResult {
  order: OrderView
}

/**
 * Creates a shop order from a cart (or explicit lines) — fully server-priced.
 * Runs in ONE transaction: stock checks, stock decrements, order + items +
 * payment row. Payment itself is asynchronous (receipt verification / Paystack).
 */
export async function createShopOrder(input: CheckoutInput, customerId?: number | null): Promise<CheckoutResult> {
  const settings = await getMarketplaceSettings()
  if (!settings.allowGuestCheckout && !customerId) {
    throw new ForbiddenError('Please sign in to place an order.')
  }

  // Resolve the lines: explicit items win; otherwise read the cart server-side.
  let lines: Array<{ productId: number; variationId: number | null; quantity: number }> = []
  if (input.items?.length) {
    lines = input.items.map((item) => ({
      productId: item.productId,
      variationId: item.variationId ?? null,
      quantity: item.quantity,
    }))
  } else if (input.token) {
    const cart = await prisma.shopCart.findUnique({
      where: { token: input.token },
      include: { items: true },
    })
    if (!cart || cart.items.length === 0) {
      throw new UnprocessableError('Your cart is empty.')
    }
    lines = cart.items.map((item) => ({
      productId: item.productId,
      variationId: item.variationId,
      quantity: item.quantity,
    }))
  }

  if (lines.length === 0) {
    throw new UnprocessableError('Your cart is empty.')
  }

  const email = input.customerEmail?.trim() || null
  if (input.paymentMethod === 'ONLINE' && !email) {
    throw new UnprocessableError('An email address is required for online card payments.')
  }

  const order = await prisma.$transaction(async (tx) => {
    // 1. Load every product FOR UPDATE-equivalent: conditional stock update below.
    const productIds = [...new Set(lines.map((line) => line.productId))]
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variations: true,
        vendor: { select: { id: true, businessName: true, status: true, isActive: true, commissionRate: true } },
        category: { select: { commissionRate: true } },
      },
    })
    const productById = new Map(products.map((product) => [product.id, product]))

    // 2. Validate + aggregate stock atomically (conditional decrement per line).
    const orderItemsData: Array<{
      vendorId: number
      productId: number
      variationId: number | null
      productName: string
      productImage: string | null
      variationLabel: string | null
      unitPrice: number
      quantity: number
      lineTotal: number
      commissionRate: number
      commissionAmount: number
      vendorNet: number
    }> = []

    let subtotal = 0
    const decremented: Array<{ productId: number; quantity: number }> = []

    for (const line of lines) {
      const product = productById.get(line.productId)
      if (!product || product.status !== 'ACTIVE' || !product.isActive) {
        throw new UnprocessableError('One or more products in your cart are no longer available.')
      }
      if (product.vendor.status !== 'APPROVED' || !product.vendor.isActive) {
        throw new UnprocessableError(`"${product.name}" is currently unavailable.`)
      }

      let priceDelta = 0
      let variationLabel: string | null = null
      if (line.variationId) {
        const variation = product.variations.find(
          (candidate) => candidate.id === line.variationId && candidate.isActive,
        )
        if (!variation) {
          throw new UnprocessableError(`A variation of "${product.name}" is no longer available.`)
        }
        priceDelta = Number(variation.priceDelta)
        variationLabel = `${variation.name}: ${variation.value}`
      }

      // Conditional decrement — fails cleanly if another request took the stock.
      const affected = await tx.product.updateMany({
        where: { id: product.id, stock: { gte: line.quantity } },
        data: { stock: { decrement: line.quantity } },
      })
      if (affected.count === 0) {
        throw new UnprocessableError(
          product.stock === 0
            ? `"${product.name}" is out of stock.`
            : `Only ${product.stock} unit(s) of "${product.name}" remain — please reduce your quantity.`,
        )
      }
      decremented.push({ productId: product.id, quantity: line.quantity })

      const unitPrice = round2(Number(product.price) + priceDelta)
      const lineTotal = round2(unitPrice * line.quantity)
      subtotal = round2(subtotal + lineTotal)

      const breakdown: CommissionBreakdown = await computeLineCommission(
        {
          vendorCommissionRate: product.vendor.commissionRate,
          categoryCommissionRate: product.category?.commissionRate ?? null,
          lineTotal,
        },
        tx,
      )

      orderItemsData.push({
        vendorId: product.vendorId,
        productId: product.id,
        variationId: line.variationId,
        productName: product.name,
        productImage: product.images[0]?.url ?? null,
        variationLabel,
        unitPrice,
        quantity: line.quantity,
        lineTotal,
        commissionRate: breakdown.commissionRate,
        commissionAmount: breakdown.commissionAmount,
        vendorNet: breakdown.vendorNet,
      })
    }

    // 3. Delivery fee from marketplace settings (free above threshold).
    const deliveryFee =
      subtotal > 0 && Number(settings.freeDeliveryThreshold) > 0 && subtotal >= Number(settings.freeDeliveryThreshold)
        ? 0
        : Number(settings.deliveryFee)
    const totalAmount = round2(subtotal + deliveryFee)

    // 4. Create the order + lines + payment row.
    const created = await tx.shopOrder.create({
      data: {
        referenceCode: generateReference('SGS'),
        customerId: customerId ?? null,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: email,
        deliveryAddress: input.deliveryAddress,
        deliveryLocation: input.deliveryLocation?.trim() || null,
        notes: input.notes?.trim() || null,
        subtotal,
        deliveryFee,
        totalAmount,
        status: 'AWAITING_PAYMENT',
        paymentMethod: input.paymentMethod,
        paymentStatus: 'UNPAID',
        items: { create: orderItemsData },
        payment: {
          create: {
            amount: totalAmount,
            paymentMethod: input.paymentMethod,
            status: 'UNPAID',
          },
        },
      },
      include: orderInclude,
    })

    // 5. Stock movements (audit trail).
    for (const decrement of decremented) {
      await tx.stockMovement.create({
        data: {
          productId: decrement.productId,
          vendorId: productById.get(decrement.productId)!.vendorId,
          change: -decrement.quantity,
          reason: 'PURCHASE',
          reference: created.referenceCode,
          actorRole: 'CUSTOMER',
        },
      })
    }

    await recordPaymentEvent(
      created.id,
      {
        type: 'ORDER_CREATED',
        status: 'UNPAID',
        amount: totalAmount,
        actorRole: customerId ? 'CUSTOMER' : 'GUEST',
        detail: `Order placed via ${input.paymentMethod}`,
      },
      tx,
    )

    // 6. Notify each vendor.
    const vendorIds = [...new Set(orderItemsData.map((item) => item.vendorId))]
    for (const vendorId of vendorIds) {
      await tx.vendorNotification.create({
        data: {
          vendorId,
          type: 'ORDER',
          title: 'New order received',
          message: `Order ${created.referenceCode} contains your product(s). Total: ${naira(totalAmount)}.`,
        },
      })
    }

    // 7. Clear the cart when checkout consumed it.
    if (!input.items?.length && input.token) {
      await tx.shopCartItem.deleteMany({
        where: { cart: { token: input.token } },
      })
    }

    return created
  })

  return { order: serializeOrder(order) }
}

async function loadOrder(reference: string): Promise<OrderWithItems> {
  const order = await prisma.shopOrder.findUnique({
    where: { referenceCode: reference.toUpperCase() },
    include: orderInclude,
  })
  if (!order) throw new NotFoundError('Order not found. Please check the reference and phone number.')
  return order
}

/** Public order lookup — reference + phone act as the two required factors. */
export async function getOrderByReference(reference: string, phone: string): Promise<OrderView> {
  const order = await loadOrder(reference)
  const normalize = (value: string) => value.replace(/\D/g, '').slice(-10)
  if (normalize(order.customerPhone) !== normalize(phone)) {
    throw new NotFoundError('Order not found. Please check the reference and phone number.')
  }
  const details = ['BANK_TRANSFER', 'OPAY'].includes(order.paymentMethod ?? '')
    ? await paymentDetailsFromSettings()
    : undefined
  const history = await prisma.shopPaymentEvent.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, type: true, status: true, detail: true, actorRole: true, createdAt: true },
  })
  return {
    ...serializeOrder(order, details),
    history: history.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  }
}

// ─── Order payment ───────────────────────────────────────────────────────────

/**
 * Attaches a transfer receipt to an order. The order becomes
 * PENDING_VERIFICATION — never PAID — until an admin verifies it.
 */
export async function submitOrderReceipt(
  reference: string,
  receipt: { url: string; publicId: string },
  transactionReference?: string,
): Promise<OrderView> {
  const order = await loadOrder(reference)
  if (order.paymentStatus === 'PAID') {
    throw new UnprocessableError('This order has already been paid.')
  }
  if (order.status === 'CANCELLED') {
    throw new UnprocessableError('This order was cancelled.')
  }
  if (order.paymentStatus === 'PENDING_VERIFICATION') {
    throw new UnprocessableError('Your receipt is already under review.')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'PENDING_VERIFICATION',
        receiptUrl: receipt.url,
        receiptPublicId: receipt.publicId,
        transactionRef: transactionReference?.trim() || order.transactionRef,
      },
      include: orderInclude,
    })
    await tx.shopPayment.update({
      where: { orderId: order.id },
      data: { status: 'PENDING_VERIFICATION', transactionRef: transactionReference?.trim() || null },
    })
    // MUST pass `tx`: the event insert has an FK to this order row, which the
    // transaction above already locked — using the global client here makes
    // the FK check wait on the transaction's own lock (deadlock → P2028).
    await recordPaymentEvent(
      order.id,
      {
        type: 'RECEIPT_SUBMITTED',
        status: 'PENDING_VERIFICATION',
        amount: Number(order.totalAmount),
        actorRole: 'CUSTOMER',
        detail: 'Transfer receipt uploaded — awaiting admin verification',
      },
      tx,
    )
    return result
  })

  return serializeOrder(updated)
}

/** Records the customer's transfer reference without a receipt upload. */
export async function submitOrderTransferReference(
  reference: string,
  transactionReference: string,
): Promise<OrderView> {
  const order = await loadOrder(reference)
  if (order.paymentStatus === 'PAID') {
    throw new UnprocessableError('This order has already been paid.')
  }
  if (order.paymentStatus === 'PENDING_VERIFICATION') {
    throw new UnprocessableError('Your payment is already under review.')
  }
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'PENDING_VERIFICATION',
        transactionRef: transactionReference,
      },
      include: orderInclude,
    })
    await tx.shopPayment.update({
      where: { orderId: order.id },
      data: { status: 'PENDING_VERIFICATION', transactionRef: transactionReference },
    })
    // MUST pass `tx` — see note in submitOrderReceipt above: the FK check on
    // the global client would deadlock against this transaction's row locks.
    await recordPaymentEvent(
      order.id,
      {
        type: 'TRANSFER_REFERENCE_SUBMITTED',
        status: 'PENDING_VERIFICATION',
        amount: Number(order.totalAmount),
        actorRole: 'CUSTOMER',
        detail: `Transfer reference: ${transactionReference}`,
      },
      tx,
    )
    return result
  })
  return serializeOrder(updated)
}

export async function cancelShopOrder(reference: string, phone: string): Promise<OrderView> {
  const order = await loadOrder(reference)
  const normalize = (value: string) => value.replace(/\D/g, '').slice(-10)
  if (normalize(order.customerPhone) !== normalize(phone)) {
    throw new NotFoundError('Order not found. Please check the reference and phone number.')
  }
  if (order.paymentStatus === 'PAID') {
    throw new UnprocessableError(
      'This order has already been paid. Please contact support for a refund instead.',
    )
  }
  if (['CANCELLED', 'DELIVERED', 'SHIPPED', 'REFUNDED', 'RETURNED'].includes(order.status)) {
    throw new UnprocessableError(`This order cannot be cancelled (${order.status.toLowerCase()}).`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Restock every line.
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      })
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          vendorId: item.vendorId,
          change: item.quantity,
          reason: 'CANCELLATION',
          reference: order.referenceCode,
          actorRole: 'CUSTOMER',
        },
      })
    }
    const result = await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        paymentStatus: order.paymentStatus === 'PENDING_VERIFICATION' ? 'CANCELLED' : order.paymentStatus,
        cancelledAt: new Date(),
        cancelReason: 'Cancelled by customer',
      },
      include: orderInclude,
    })
    await tx.shopPayment.updateMany({
      where: { orderId: order.id, status: { not: 'PAID' } },
      data: { status: 'CANCELLED' },
    })
    // MUST pass `tx` — same FK/deadlock reason as the payment-event helpers.
    await recordPaymentEvent(
      order.id,
      {
        type: 'ORDER_CANCELLED',
        status: 'CANCELLED',
        actorRole: 'CUSTOMER',
        detail: 'Cancelled by customer before payment confirmation',
      },
      tx,
    )
    for (const vendorId of [...new Set(order.items.map((item) => item.vendorId))]) {
      await tx.vendorNotification.create({
        data: {
          vendorId,
          type: 'ORDER',
          title: 'Order cancelled',
          message: `Order ${order.referenceCode} was cancelled by the customer.`,
        },
      })
    }
    return result
  })
  return serializeOrder(updated)
}

// ─── Product reviews ─────────────────────────────────────────────────────────

export interface ReviewView {
  id: number
  customerName: string
  rating: number
  comment: string
  reply: string | null
  createdAt: string
}

export async function listProductReviews(
  productId: number,
  page: number,
  perPage: number,
): Promise<Paged<ReviewView>> {
  const where: Prisma.ProductReviewWhereInput = { productId, isApproved: true }
  const [rows, total] = await Promise.all([
    prisma.productReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.productReview.count({ where }),
  ])
  return {
    items: rows.map((row) => ({
      id: row.id,
      customerName: row.customerName,
      rating: row.rating,
      comment: row.comment,
      reply: row.reply,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    perPage,
  }
}

/**
 * Creates a product review — only for customers with a VERIFIED, DELIVERED
 * order containing that product. Reviews start PENDING until moderated.
 */
export async function createProductReview(
  productId: number,
  input: { rating: number; comment: string; customerName?: string },
  auth: { customerId?: number; phone?: string; email?: string },
): Promise<{ message: string }> {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product || product.status !== 'ACTIVE') {
    throw new NotFoundError('Product not found.')
  }

  // Verified purchase: a delivered order for this product exists that matches
  // the customer's identity (account id, phone, or email).
  const matchingOrder = await prisma.shopOrder.findFirst({
    where: {
      paymentStatus: 'PAID',
      status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING', 'READY_FOR_DISPATCH'] },
      items: { some: { productId } },
      OR: [
        ...(auth.customerId ? [{ customerId: auth.customerId }] : []),
        ...(auth.phone ? [{ customerPhone: { contains: auth.phone.replace(/\D/g, '').slice(-10) } }] : []),
        ...(auth.email ? [{ customerEmail: auth.email.toLowerCase() }] : []),
      ],
    },
    select: { id: true },
  })
  if (!matchingOrder) {
    throw new ForbiddenError('You can only review products you have purchased.')
  }

  const alreadyReviewed = await prisma.productReview.findUnique({
    where: { orderId_productId: { orderId: matchingOrder.id, productId } },
  })
  if (alreadyReviewed) {
    throw new ConflictError('You have already reviewed this product from this order.')
  }

  await prisma.productReview.create({
    data: {
      productId,
      vendorId: product.vendorId,
      orderId: matchingOrder.id,
      customerId: auth.customerId ?? null,
      customerName: input.customerName?.trim() || 'SAWABA Customer',
      rating: input.rating,
      comment: input.comment,
    },
  })

  return { message: 'Thank you! Your review has been submitted for moderation.' }
}

/** Recalculates the cached product rating after moderation changes. */
export async function refreshProductRating(productId: number): Promise<void> {
  const approved = await prisma.productReview.findMany({
    where: { productId, isApproved: true },
    select: { rating: true },
  })
  if (approved.length === 0) {
    await prisma.product.update({
      where: { id: productId },
      data: { rating: 0, reviewCount: 0 },
    })
    return
  }
  const average = approved.reduce((sum, review) => sum + review.rating, 0) / approved.length
  await prisma.product.update({
    where: { id: productId },
    data: { rating: Math.round(average * 10) / 10, reviewCount: approved.length },
  })
}

// ─── Customer order history ──────────────────────────────────────────────────

export async function listCustomerOrders(
  customerId: number,
  page: number,
  perPage: number,
): Promise<Paged<OrderView>> {
  const where: Prisma.ShopOrderWhereInput = { customerId }
  const [rows, total] = await Promise.all([
    prisma.shopOrder.findMany({
      where,
      include: {
        ...orderInclude,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, type: true, status: true, detail: true, actorRole: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.shopOrder.count({ where }),
  ])
  return {
    items: rows.map((order) => ({
      ...serializeOrder(order),
      history: order.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    })),
    total,
    page,
    perPage,
  }
}

export { generateReference }
