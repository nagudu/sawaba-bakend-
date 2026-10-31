import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Prisma, Vendor } from '@prisma/client'
import { env } from '../config/env'
import { prisma } from '../config/database'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnprocessableError,
} from '../utils/errors'
import { getPagination } from '../utils/response'
import type { Paged } from '../types'
import { getMarketplaceSettings, naira, requireVendorRegistrationOpen } from './marketplaceService'
import { generateReference, recordPaymentEvent } from './shopService'
import { markOrderPaid } from './shopPaymentService'
import type {
  VendorLoginInput,
  VendorProductInput,
  VendorProfileUpdateInput,
  VendorRegisterInput,
} from '../validators/shop'

/**
 * Vendor portal — registration/approval, products, orders, earnings, payouts.
 *
 * DATA ISOLATION: every query in this file is keyed by `vendorId` from the
 * verified JWT — never from client input. A vendor token can only ever reach
 * its own rows, enforced here on the backend.
 */

const round2 = (value: number): number => Math.round(value * 100) / 100

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 140) || 'item'
  )
}

async function uniqueVendorSlug(base: string): Promise<string> {
  const root = slugify(base)
  let candidate = root
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const existing = await prisma.vendor.findUnique({ where: { slug: candidate } })
    if (!existing) return candidate
    candidate = `${root}-${Math.floor(Math.random() * 900 + 100)}`
  }
  return `${root}-${Date.now().toString(36)}`
}

async function uniqueProductSlug(base: string): Promise<string> {
  const root = slugify(base).slice(0, 210)
  let candidate = root
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const existing = await prisma.product.findUnique({ where: { slug: candidate } })
    if (!existing) return candidate
    candidate = `${root}-${Math.floor(Math.random() * 900 + 100)}`
  }
  return `${root}-${Date.now().toString(36)}`
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface VendorPublic {
  id: number
  businessName: string
  contactName: string
  slug: string
  email: string
  phone: string
  logoUrl: string | null
  address: string | null
  location: string | null
  bankName: string | null
  bankAccountName: string | null
  bankAccountNumber: string | null
  businessInfo: string | null
  status: string
  statusReason: string | null
  commissionRate: number | null
  rating: number
  approvedAt: string | null
  createdAt: string
  /** Admin-only field guard: never serialized to public consumers. */
  hasPassword?: boolean
}

export function serializeVendor(vendor: Vendor, includePrivate = false): VendorPublic {
  return {
    id: vendor.id,
    businessName: vendor.businessName,
    contactName: vendor.contactName,
    slug: vendor.slug,
    email: vendor.email,
    phone: vendor.phone,
    logoUrl: vendor.logoUrl,
    address: vendor.address,
    location: vendor.location,
    bankName: vendor.bankName,
    bankAccountName: vendor.bankAccountName,
    bankAccountNumber: vendor.bankAccountNumber,
    businessInfo: vendor.businessInfo,
    status: vendor.status,
    statusReason: vendor.statusReason,
    commissionRate: vendor.commissionRate === null ? null : Number(vendor.commissionRate),
    rating: Number(vendor.rating),
    approvedAt: vendor.approvedAt?.toISOString() ?? null,
    createdAt: vendor.createdAt.toISOString(),
    ...(includePrivate ? {} : {}),
  }
}

function signVendorToken(vendor: Vendor): string {
  return jwt.sign(
    { sub: vendor.id, email: vendor.email, name: vendor.businessName, role: 'VENDOR' },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  )
}

export interface VendorSession {
  token: string
  vendor: VendorPublic
}

/** Public self-registration. New vendors always start PENDING admin approval. */
export async function registerVendor(
  input: VendorRegisterInput,
): Promise<{ message: string; vendor: VendorPublic }> {
  await requireVendorRegistrationOpen()

  const email = input.email.toLowerCase()
  const existing = await prisma.vendor.findFirst({ where: { email } })
  if (existing) {
    throw new ConflictError('A vendor account with this email already exists. Please sign in instead.')
  }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const slug = await uniqueVendorSlug(input.businessName)
  const vendor = await prisma.$transaction(async (tx) => {
    const application = await tx.vendor.create({
      data: {
        businessName: input.businessName,
        contactName: input.contactName,
        slug,
        email,
        phone: input.phone,
        passwordHash,
        address: input.address?.trim() || null,
        location: input.location?.trim() || null,
        bankName: input.bankName?.trim() || null,
        bankAccountName: input.bankAccountName?.trim() || null,
        bankAccountNumber: input.bankAccountNumber?.trim() || null,
        businessInfo: input.businessInfo?.trim() || null,
        status: 'PENDING',
      },
    })

    await tx.marketplaceAuditLog.create({
      data: {
        actorRole: 'VENDOR',
        actorId: application.id,
        actorName: application.businessName,
        action: 'VENDOR_REGISTERED',
        entityType: 'Vendor',
        entityId: application.id,
        detail: `${application.businessName} applied to sell on SAWABA`,
      },
    })

    return application
  })

  return {
    message:
      'Application received! Your vendor account is pending admin approval. You can sign in to complete your profile while you wait.',
    vendor: serializeVendor(vendor),
  }
}

export async function loginVendor(input: VendorLoginInput): Promise<VendorSession> {
  const identifier = input.identifier.trim().toLowerCase()
  const byEmail = identifier.includes('@')

  const vendor = await prisma.vendor.findFirst({
    where: byEmail ? { email: identifier } : { phone: identifier },
  })
  if (!vendor || !vendor.passwordHash) {
    throw new UnauthorizedError('Invalid login details.')
  }
  if (!vendor.isActive) {
    throw new UnauthorizedError('This vendor account has been deactivated.')
  }
  const matches = await bcrypt.compare(input.password, vendor.passwordHash)
  if (!matches) {
    throw new UnauthorizedError('Invalid login details.')
  }

  await prisma.vendor.update({
    where: { id: vendor.id },
    data: { lastLoginAt: new Date() },
  })

  return { token: signVendorToken(vendor), vendor: serializeVendor(vendor, true) }
}

export async function getVendorMe(vendorId: number): Promise<VendorPublic> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new UnauthorizedError('Vendor account no longer exists.')
  return serializeVendor(vendor, true)
}

export async function updateVendorProfile(
  vendorId: number,
  input: VendorProfileUpdateInput,
): Promise<VendorPublic> {
  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address.trim() || null } : {}),
      ...(input.location !== undefined ? { location: input.location.trim() || null } : {}),
      ...(input.bankName !== undefined ? { bankName: input.bankName.trim() || null } : {}),
      ...(input.bankAccountName !== undefined ? { bankAccountName: input.bankAccountName.trim() || null } : {}),
      ...(input.bankAccountNumber !== undefined ? { bankAccountNumber: input.bankAccountNumber.trim() || null } : {}),
      ...(input.businessInfo !== undefined ? { businessInfo: input.businessInfo.trim() || null } : {}),
    },
  })
  return serializeVendor(vendor, true)
}

export async function changeVendorPassword(
  vendorId: number,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor || !vendor.passwordHash) throw new UnauthorizedError('Vendor account no longer exists.')
  const matches = await bcrypt.compare(input.currentPassword, vendor.passwordHash)
  if (!matches) throw new UnprocessableError('Current password is incorrect.')
  const passwordHash = await bcrypt.hash(input.newPassword, 12)
  await prisma.vendor.update({ where: { id: vendorId }, data: { passwordHash } })
}

// ─── Dashboard overview ──────────────────────────────────────────────────────

export interface VendorDashboard {
  products: { total: number; active: number; outOfStock: number; pendingReview: number }
  orders: { new: number; processing: number; completed: number; cancelled: number; returned: number }
  earnings: {
    totalSales: number
    totalCommission: number
    pending: number
    available: number
    paid: number
  }
  recentOrders: Array<{
    itemId: number
    orderReference: string
    productName: string
    quantity: number
    lineTotal: number
    status: string
    customerName: string
    createdAt: string
  }>
  notifications: Array<{
    id: number
    type: string
    title: string
    message: string
    readAt: string | null
    createdAt: string
  }>
}

export async function getVendorDashboard(vendorId: number): Promise<VendorDashboard> {
  const [productCounts, itemGroups, ledgerAgg, recentItems, notifications] = await Promise.all([
    prisma.product.groupBy({
      by: ['status'],
      where: { vendorId },
      _count: { _all: true },
    }),
    prisma.shopOrderItem.groupBy({
      by: ['status'],
      where: { vendorId },
      _count: { _all: true },
    }),
    prisma.commissionLedger.groupBy({
      by: ['settlementStatus'],
      where: { vendorId },
      _sum: { vendorNet: true, commissionAmount: true },
    }),
    prisma.shopOrderItem.findMany({
      where: { vendorId },
      include: { order: { select: { referenceCode: true, customerName: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.vendorNotification.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ])

  const totalProducts = productCounts.reduce((sum, row) => sum + row._count._all, 0)
  const outOfStock = await prisma.product.count({ where: { vendorId, stock: 0, status: 'ACTIVE' } })

  const statusCount = (rows: Array<{ status: string; _count: { _all: number } }>, status: string) =>
    rows.find((row) => row.status === status)?._count._all ?? 0

  const sumFor = (status: string) =>
    Number(ledgerAgg.find((row) => row.settlementStatus === status)?._sum.vendorNet ?? 0)

  return {
    products: {
      total: totalProducts,
      active: statusCount(productCounts as never, 'ACTIVE'),
      outOfStock,
      pendingReview: statusCount(productCounts as never, 'PENDING_REVIEW'),
    },
    orders: {
      new: statusCount(itemGroups as never, 'PENDING') + statusCount(itemGroups as never, 'CONFIRMED'),
      processing: statusCount(itemGroups as never, 'PREPARING'),
      completed: statusCount(itemGroups as never, 'DELIVERED'),
      cancelled: statusCount(itemGroups as never, 'CANCELLED'),
      returned: statusCount(itemGroups as never, 'RETURNED'),
    },
    earnings: {
      totalSales: round2(
        ledgerAgg.reduce(
          (sum, row) =>
            sum +
            (row.settlementStatus === 'REVERSED' ? 0 : Number(row._sum.vendorNet ?? 0) + Number(row._sum.commissionAmount ?? 0)),
          0,
        ),
      ),
      totalCommission: round2(
        ledgerAgg.reduce(
          (sum, row) => sum + (row.settlementStatus === 'REVERSED' ? 0 : Number(row._sum.commissionAmount ?? 0)),
          0,
        ),
      ),
      pending: round2(sumFor('PENDING')),
      available: round2(sumFor('RELEASED')),
      paid: round2(sumFor('PAID')),
    },
    recentOrders: recentItems.map((item) => ({
      itemId: item.id,
      orderReference: item.order.referenceCode,
      productName: item.productName,
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
      status: item.status,
      customerName: item.order.customerName,
      createdAt: item.order.createdAt.toISOString(),
    })),
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    })),
  }
}

export async function markVendorNotificationRead(vendorId: number, notificationId: number): Promise<void> {
  await prisma.vendorNotification.updateMany({
    where: { id: notificationId, vendorId, readAt: null },
    data: { readAt: new Date() },
  })
}

// ─── Product management ──────────────────────────────────────────────────────

function assertVendorSellable(vendor: Vendor): void {
  if (!vendor.isActive || vendor.status !== 'APPROVED') {
    throw new ForbiddenError(
      vendor.status === 'PENDING'
        ? 'Your vendor application is still pending approval. Products can be listed once approved.'
        : !vendor.isActive
          ? 'Your vendor account is deactivated. You cannot manage products right now.'
          : `Your vendor account is ${vendor.status.toLowerCase()}. You cannot manage products right now.`,
    )
  }
}

export interface VendorProductView {
  id: number
  name: string
  slug: string
  description: string
  brand: string | null
  price: number
  compareAtPrice: number | null
  stock: number
  lowStockThreshold: number
  status: string
  isActive: boolean
  rating: number
  reviewCount: number
  salesCount: number
  rejectionReason: string | null
  category: { id: number; name: string } | null
  images: Array<{ id: number; url: string; alt: string | null }>
  variations: Array<{ id: number; name: string; value: string; priceDelta: number; stock: number | null }>
  createdAt: string
  updatedAt: string
}

const vendorProductInclude = {
  category: { select: { id: true, name: true } },
  images: { orderBy: { sortOrder: 'asc' as const } },
  variations: true,
} as const

type VendorProductWithRelations = Prisma.ProductGetPayload<{ include: typeof vendorProductInclude }>

export function serializeVendorProduct(product: VendorProductWithRelations): VendorProductView {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    brand: product.brand,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice === null ? null : Number(product.compareAtPrice),
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
    status: product.status,
    isActive: product.isActive,
    rating: Number(product.rating),
    reviewCount: product.reviewCount,
    salesCount: product.salesCount,
    rejectionReason: product.rejectionReason,
    category: product.category,
    images: product.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt })),
    variations: product.variations.map((variation) => ({
      id: variation.id,
      name: variation.name,
      value: variation.value,
      priceDelta: Number(variation.priceDelta),
      stock: variation.stock,
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }
}

export async function listVendorProducts(
  vendorId: number,
  query: { page: number; perPage: number; status?: string; search?: string },
): Promise<Paged<VendorProductView>> {
  const { offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const where: Prisma.ProductWhereInput = {
    vendorId,
    ...(query.status ? { status: query.status as Prisma.EnumProductStatusFilter['equals'] } : {}),
    ...(query.search
      ? { name: { contains: query.search } }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: vendorProductInclude,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.product.count({ where }),
  ])
  return { items: rows.map(serializeVendorProduct), total, page: query.page, perPage: query.perPage }
}

export async function createVendorProduct(
  vendorId: number,
  vendor: Vendor,
  input: VendorProductInput,
  imageUrls: string[] = [],
): Promise<VendorProductView> {
  assertVendorSellable(vendor)
  const settings = await getMarketplaceSettings()

  if (input.categoryId) {
    const category = await prisma.productCategory.findFirst({
      where: { id: input.categoryId, isActive: true },
    })
    if (!category) throw new UnprocessableError('Selected category is unavailable.')
  }

  // Parse the optional JSON image list (URLs already uploaded by the frontend).
  let images = imageUrls.filter(Boolean)
  if (!images.length && input.imagesJson) {
    try {
      const parsed = JSON.parse(input.imagesJson) as unknown
      if (Array.isArray(parsed)) {
        images = parsed.filter((url): url is string => typeof url === 'string' && url.length <= 500)
      }
    } catch {
      throw new UnprocessableError('Invalid image list.')
    }
  }
  if (images.length === 0) {
    throw new UnprocessableError('At least one product image is required.')
  }
  if (images.length > 8) {
    throw new UnprocessableError('A maximum of 8 product images is allowed.')
  }

  const status: Prisma.EnumProductStatusFilter['equals'] = settings.requireProductApproval
    ? ((input.status === 'DRAFT' ? 'DRAFT' : 'PENDING_REVIEW') as never)
    : ('ACTIVE' as never)

  const product = await prisma.product.create({
    data: {
      vendorId,
      categoryId: input.categoryId ?? null,
      name: input.name,
      slug: await uniqueProductSlug(input.name),
      description: input.description,
      brand: input.brand?.trim() || null,
      price: input.price,
      compareAtPrice: input.compareAtPrice ? Number(input.compareAtPrice) : null,
      stock: input.stock,
      lowStockThreshold: input.lowStockThreshold ?? 5,
      status,
      approvedAt: status === 'ACTIVE' ? new Date() : null,
      images: {
        create: images.map((url, index) => ({ url, sortOrder: index, alt: `${input.name} image ${index + 1}` })),
      },
      variations: input.variations?.length
        ? {
            create: input.variations.map((variation) => ({
              name: variation.name,
              value: variation.value,
              priceDelta: variation.priceDelta ?? 0,
            })),
          }
        : undefined,
    },
    include: vendorProductInclude,
  })

  if (input.stock > 0) {
    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        vendorId,
        change: input.stock,
        reason: 'RESTOCK',
        note: 'Initial stock',
        actorRole: 'VENDOR',
        actorId: vendorId,
      },
    })
  }

  return serializeVendorProduct(product)
}

export async function updateVendorProduct(
  vendorId: number,
  vendor: Vendor,
  productId: number,
  input: Partial<VendorProductInput>,
  newImageUrls: string[] = [],
): Promise<VendorProductView> {
  assertVendorSellable(vendor)

  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId },
    include: vendorProductInclude,
  })
  if (!product) throw new NotFoundError('Product not found.')

  if (input.categoryId) {
    const category = await prisma.productCategory.findFirst({
      where: { id: input.categoryId, isActive: true },
    })
    if (!category) throw new UnprocessableError('Selected category is unavailable.')
  }

  let stockDelta: number | null = null
  if (input.stock !== undefined && input.stock !== product.stock) {
    stockDelta = input.stock - product.stock
  }

  const updates: Prisma.ProductUpdateInput = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description
  if (input.brand !== undefined) updates.brand = input.brand.trim() || null
  if (input.categoryId !== undefined) {
    updates.category = input.categoryId
      ? { connect: { id: input.categoryId } }
      : { disconnect: true }
  }
  if (input.price !== undefined) updates.price = input.price
  if (input.compareAtPrice !== undefined) {
    updates.compareAtPrice = input.compareAtPrice ? Number(input.compareAtPrice) : null
  }
  if (input.stock !== undefined) updates.stock = input.stock
  if (input.lowStockThreshold !== undefined) updates.lowStockThreshold = input.lowStockThreshold

  // Editing an ACTIVE product that was rejected/reviewed → back to review when
  // the marketplace requires approval (prevents unreviewed edits going live).
  const settings = await getMarketplaceSettings()
  if (
    settings.requireProductApproval &&
    product.status === 'ACTIVE' &&
    (input.name !== undefined || input.description !== undefined || input.price !== undefined)
  ) {
    updates.status = 'PENDING_REVIEW'
    updates.approvedAt = null
  }

  const product2 = await prisma.$transaction(async (tx) => {
    const result = await tx.product.update({
      where: { id: product.id },
      data: updates,
      include: vendorProductInclude,
    })

    if (newImageUrls.length > 0) {
      await tx.productImage.deleteMany({ where: { productId: product.id } })
      await tx.productImage.createMany({
        data: newImageUrls.map((url, index) => ({
          productId: product.id,
          url,
          sortOrder: index,
          alt: `${result.name} image ${index + 1}`,
        })),
      })
    }

    if (input.variations !== undefined) {
      await tx.productVariation.deleteMany({ where: { productId: product.id } })
      if (input.variations.length > 0) {
        await tx.productVariation.createMany({
          data: input.variations.map((variation) => ({
            productId: product.id,
            name: variation.name,
            value: variation.value,
            priceDelta: variation.priceDelta ?? 0,
          })),
        })
      }
    }

    if (stockDelta !== null && stockDelta !== 0) {
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          vendorId,
          change: stockDelta,
          reason: 'ADJUSTMENT',
          note: 'Stock edited by vendor',
          actorRole: 'VENDOR',
          actorId: vendorId,
        },
      })
    }

    return tx.product.findUniqueOrThrow({
      where: { id: product.id },
      include: vendorProductInclude,
    })
  })

  return serializeVendorProduct(product2)
}

export async function setVendorProductActive(
  vendorId: number,
  productId: number,
  isActive: boolean,
): Promise<VendorProductView> {
  if (isActive) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
    if (!vendor) throw new NotFoundError('Vendor account not found.')
    assertVendorSellable(vendor)
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId },
    include: vendorProductInclude,
  })
  if (!product) throw new NotFoundError('Product not found.')
  if (product.status !== 'ACTIVE' && isActive) {
    throw new UnprocessableError('Only approved products can be reactivated.')
  }
  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { isActive },
    include: vendorProductInclude,
  })
  return serializeVendorProduct(updated)
}

export async function deleteVendorProduct(vendorId: number, productId: number): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId },
    select: { id: true, orderItems: { select: { id: true }, take: 1 } },
  })
  if (!product) throw new NotFoundError('Product not found.')
  if (product.orderItems.length > 0) {
    // Orders reference this product — archive instead of destroying history.
    await prisma.product.update({
      where: { id: productId },
      data: { status: 'ARCHIVED', isActive: false },
    })
    return
  }
  await prisma.product.delete({ where: { id: productId } })
}

// ─── Orders (vendor's slice) ────────────────────────────────────────────────

export interface VendorOrderItemView {
  id: number
  orderReference: string
  productName: string
  productImage: string | null
  variationLabel: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  status: string
  trackingInfo: string | null
  cancelReason: string | null
  customerName: string
  customerPhone: string
  deliveryAddress: string
  deliveryLocation: string | null
  orderStatus: string
  paymentStatus: string
  createdAt: string
}

export async function listVendorOrderItems(
  vendorId: number,
  query: { status?: string; search?: string; page: number; perPage: number },
): Promise<Paged<VendorOrderItemView>> {
  const { offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const where: Prisma.ShopOrderItemWhereInput = {
    vendorId,
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search
      ? {
          OR: [
            { order: { referenceCode: { contains: query.search } } },
            { order: { customerName: { contains: query.search } } },
            { order: { customerPhone: { contains: query.search } } },
            { productName: { contains: query.search } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.shopOrderItem.findMany({
      where,
      include: {
        order: {
          select: {
            referenceCode: true,
            customerName: true,
            customerPhone: true,
            deliveryAddress: true,
            deliveryLocation: true,
            status: true,
            paymentStatus: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.shopOrderItem.count({ where }),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      orderReference: row.order.referenceCode,
      productName: row.productName,
      productImage: row.productImage,
      variationLabel: row.variationLabel,
      unitPrice: Number(row.unitPrice),
      quantity: row.quantity,
      lineTotal: Number(row.lineTotal),
      status: row.status,
      trackingInfo: row.trackingInfo,
      cancelReason: row.cancelReason,
      customerName: row.order.customerName,
      customerPhone: row.order.customerPhone,
      deliveryAddress: row.order.deliveryAddress,
      deliveryLocation: row.order.deliveryLocation,
      orderStatus: row.order.status,
      paymentStatus: row.order.paymentStatus,
      createdAt: row.order.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    perPage: query.perPage,
  }
}

const ITEM_STATUS_FLOW: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
}

export async function updateVendorOrderItem(
  vendorId: number,
  itemId: number,
  input: { status: string; trackingInfo?: string; cancelReason?: string },
): Promise<VendorOrderItemView> {
  const item = await prisma.shopOrderItem.findFirst({
    where: { id: itemId, vendorId },
    include: {
      order: {
        select: {
          id: true,
          referenceCode: true,
          paymentStatus: true,
          status: true,
          items: { select: { vendorId: true } },
        },
      },
      vendor: { select: { id: true } },
    },
  })
  if (!item) throw new NotFoundError('Order item not found.')

  if (item.order.paymentStatus !== 'PAID' && input.status !== 'CANCELLED') {
    throw new UnprocessableError('This order is not paid yet — the item cannot be prepared or shipped.')
  }

  const allowed = ITEM_STATUS_FLOW[item.status] ?? []
  if (!allowed.includes(input.status)) {
    throw new UnprocessableError(`Cannot move this item from ${item.status} to ${input.status}.`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.shopOrderItem.update({
      where: { id: item.id },
      data: {
        status: input.status as never,
        ...(input.trackingInfo ? { trackingInfo: input.trackingInfo } : {}),
        ...(input.status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
        ...(input.status === 'SHIPPED' ? { shippedAt: new Date() } : {}),
        ...(input.status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        ...(input.status === 'CANCELLED' ? { cancelReason: input.cancelReason || 'Cancelled by vendor' } : {}),
      },
      include: {
        order: { select: { referenceCode: true } },
      },
    })

    if (input.status === 'CANCELLED' && item.order.paymentStatus === 'PAID') {
      // Paid order, vendor cannot supply → auto-refund this vendor's line.
      await handleLineRefund(item.order.id, item.vendorId, Number(item.lineTotal), 'Vendor cancelled the item', tx)
    }

    if (input.status === 'CANCELLED') {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      })
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          vendorId,
          change: item.quantity,
          reason: 'CANCELLATION',
          reference: item.order.referenceCode,
          actorRole: 'VENDOR',
          actorId: vendorId,
        },
      })
    }

    // Roll the parent order up: delivered when every line is done; processing otherwise.
    const siblings = await tx.shopOrderItem.findMany({
      where: { orderId: item.order.id },
      select: { status: true, vendorId: true },
    })
    const others = siblings
    const allDelivered = others.every((row) => row.status === 'DELIVERED')
    const anyShippedOrPreparing = others.some((row) =>
      ['SHIPPED', 'PREPARING', 'DELIVERED'].includes(row.status),
    )
    const allCancelled = others.every((row) => row.status === 'CANCELLED' || row.status === 'RETURNED')

    const parentStatus = allCancelled
      ? 'CANCELLED'
      : allDelivered
        ? 'DELIVERED'
        : anyShippedOrPreparing
          ? item.order.status === 'READY_FOR_DISPATCH' || item.order.status === 'PROCESSING'
            ? item.order.status
            : 'PROCESSING'
          : item.order.status

    if (allDelivered && item.order.status !== 'DELIVERED') {
      await tx.shopOrder.update({
        where: { id: item.order.id },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      })
    } else if (allCancelled && item.order.status !== 'CANCELLED') {
      await tx.shopOrder.update({
        where: { id: item.order.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'All items cancelled by vendors' },
      })
    } else if (parentStatus !== item.order.status && item.order.status === 'AWAITING_PAYMENT') {
      // Payment-confirmed orders only — never override the awaiting state.
    } else if (anyShippedOrPreparing && item.order.status === 'PAYMENT_CONFIRMED') {
      await tx.shopOrder.update({
        where: { id: item.order.id },
        data: { status: 'PROCESSING' },
      })
    }

    await recordPaymentEvent(
      item.order.id,
      {
        type: 'ITEM_STATUS_CHANGED',
        status: input.status,
        actorRole: 'VENDOR',
        actorId: vendorId,
        detail: `${item.productName}: ${item.status} → ${input.status}${
          input.trackingInfo ? ` · Tracking: ${input.trackingInfo}` : ''
        }${input.cancelReason ? ` · ${input.cancelReason}` : ''}`,
      },
      tx,
    )

    return result
  })

  const fresh = await prisma.shopOrderItem.findUniqueOrThrow({
    where: { id: updated.id },
    include: {
      order: {
        select: {
          referenceCode: true,
          customerName: true,
          customerPhone: true,
          deliveryAddress: true,
          deliveryLocation: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
        },
      },
    },
  })

  return {
    id: fresh.id,
    orderReference: fresh.order.referenceCode,
    productName: fresh.productName,
    productImage: fresh.productImage,
    variationLabel: fresh.variationLabel,
    unitPrice: Number(fresh.unitPrice),
    quantity: fresh.quantity,
    lineTotal: Number(fresh.lineTotal),
    status: fresh.status,
    trackingInfo: fresh.trackingInfo,
    cancelReason: fresh.cancelReason,
    customerName: fresh.order.customerName,
    customerPhone: fresh.order.customerPhone,
    deliveryAddress: fresh.order.deliveryAddress,
    deliveryLocation: fresh.order.deliveryLocation,
    orderStatus: fresh.order.status,
    paymentStatus: fresh.order.paymentStatus,
    createdAt: fresh.order.createdAt.toISOString(),
  }
}

/**
 * Refunds one vendor's line of a paid order: reverses (not deletes) the
 * commission ledger, records a ShopRefund, and adjusts the order's refunded
 * total. If the whole order ends up refunded, the order + payment flip to
 * REFUNDED. Safe under concurrency via the unique ledger row + status guards.
 */
export async function handleLineRefund(
  orderId: number,
  vendorId: number | null,
  amount: number,
  reason: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const order = await tx.shopOrder.findUnique({
    where: { id: orderId },
    include: { ledger: true, items: true },
  })
  if (!order) return

  await tx.shopRefund.create({
    data: {
      orderId,
      vendorId,
      reason,
      amount,
      status: 'COMPLETED',
      requestedBy: 'SYSTEM',
    },
  })

  await tx.shopOrder.update({
    where: { id: orderId },
    data: {
      refundedAmount: { increment: amount },
      refundedAt: new Date(),
    },
  })

  // Reverse the ledger entries for this vendor (or all lines when vendorId is null).
  const ledgerEntries = order.ledger.filter(
    (entry) => (vendorId === null || entry.vendorId === vendorId) && entry.settlementStatus !== 'PAID',
  )
  for (const entry of ledgerEntries) {
    if (entry.settlementStatus === 'REVERSED') continue
    await tx.commissionLedger.update({
      where: { id: entry.id },
      data: {
        settlementStatus: 'REVERSED',
        reversedAmount: entry.vendorNet,
        releasedAt: null,
        payoutId: null,
      },
    })
  }
  // Vendor share already paid out on a PAID entry becomes a negative adjustment.
  const paidEntries = order.ledger.filter(
    (entry) => (vendorId === null || entry.vendorId === vendorId) && entry.settlementStatus === 'PAID',
  )
  for (const entry of paidEntries) {
    await tx.commissionLedger.update({
      where: { id: entry.id },
      data: { reversedAmount: entry.vendorNet },
    })
  }

  const refundedTotal = Number(order.refundedAmount) + amount
  const fullyRefunded = refundedTotal >= Number(order.totalAmount) - 0.01

  if (fullyRefunded) {
    await tx.shopOrder.update({
      where: { id: orderId },
      data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' },
    })
    await tx.shopPayment.updateMany({
      where: { orderId },
      data: { status: 'REFUNDED' },
    })
  }

  await recordPaymentEvent(
    orderId,
    {
      type: 'REFUND_PROCESSED',
      status: 'REFUNDED',
      amount,
      actorRole: 'SYSTEM',
      detail: reason,
    },
    tx,
  )

  if (vendorId !== null) {
    await tx.vendorNotification.create({
      data: {
        vendorId,
        type: 'REFUND',
        title: 'Refund processed',
        message: `${naira(amount)} for order ${order.referenceCode} has been refunded. Reason: ${reason}`,
      },
    })
  }
}

// ─── Earnings + payouts ──────────────────────────────────────────────────────

export interface VendorLedgerEntry {
  id: number
  orderReference: string
  productName: string
  quantity: number
  salePrice: number
  commissionRate: number
  commissionAmount: number
  vendorNet: number
  reversedAmount: number
  settlementStatus: string
  releasedAt: string | null
  paidAt: string | null
  createdAt: string
}

export interface VendorEarningsView {
  balances: { pending: number; available: number; paid: number; reversed: number }
  bankDetails: { bankName: string | null; accountName: string | null; accountNumber: string | null }
  releaseDelayDays: number
  entries: Paged<VendorLedgerEntry>
  payouts: Array<{
    id: number
    referenceCode: string
    amount: number
    status: string
    note: string | null
    transactionRef: string | null
    requestedAt: string
    processedAt: string | null
  }>
}

/**
 * Moves matured PENDING ledger entries to RELEASED: payment confirmed AND the
 * item delivered AND the release delay elapsed. Called lazily on reads.
 */
export async function releaseMaturedEarnings(tx: Prisma.TransactionClient = prisma): Promise<void> {
  const settings = await getMarketplaceSettings(tx)
  const delayMs = settings.releaseDelayDays * 24 * 60 * 60 * 1000
  const cutoff = new Date(Date.now() - delayMs)

  const matured = await tx.commissionLedger.findMany({
    where: {
      settlementStatus: 'PENDING',
      orderItem: { status: 'DELIVERED', deliveredAt: { not: null, lte: cutoff } },
    },
    select: { id: true },
  })
  if (matured.length === 0) return

  await tx.commissionLedger.updateMany({
    where: { id: { in: matured.map((row) => row.id) }, settlementStatus: 'PENDING' },
    data: { settlementStatus: 'RELEASED', releasedAt: new Date() },
  })
}

export async function getVendorEarnings(
  vendorId: number,
  query: { page: number; perPage: number; settlementStatus?: string },
): Promise<VendorEarningsView> {
  await releaseMaturedEarnings()

  const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } })
  const settings = await getMarketplaceSettings()

  const where: Prisma.CommissionLedgerWhereInput = {
    vendorId,
    ...(query.settlementStatus ? { settlementStatus: query.settlementStatus as never } : {}),
  }

  const [rows, total, aggregates, payouts] = await Promise.all([
    prisma.commissionLedger.findMany({
      where,
      include: {
        order: { select: { referenceCode: true } },
        product: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    }),
    prisma.commissionLedger.count({ where }),
    prisma.commissionLedger.groupBy({
      by: ['settlementStatus'],
      where: { vendorId },
      _sum: { vendorNet: true, reversedAmount: true },
    }),
    prisma.vendorPayout.findMany({
      where: { vendorId },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    }),
  ])

  const sumFor = (status: string) =>
    Number(aggregates.find((row) => row.settlementStatus === status)?._sum.vendorNet ?? 0)

  return {
    balances: {
      pending: round2(sumFor('PENDING')),
      available: round2(sumFor('RELEASED')),
      paid: round2(sumFor('PAID')),
      reversed: round2(
        aggregates.reduce((totalSum, row) => totalSum + Number(row._sum.reversedAmount ?? 0), 0),
      ),
    },
    bankDetails: {
      bankName: vendor.bankName,
      accountName: vendor.bankAccountName,
      accountNumber: vendor.bankAccountNumber,
    },
    releaseDelayDays: settings.releaseDelayDays,
    entries: {
      items: rows.map((row) => ({
        id: row.id,
        orderReference: row.order.referenceCode,
        productName: row.product.name,
        quantity: row.quantity,
        salePrice: Number(row.salePrice),
        commissionRate: Number(row.commissionRate),
        commissionAmount: Number(row.commissionAmount),
        vendorNet: Number(row.vendorNet),
        reversedAmount: Number(row.reversedAmount),
        settlementStatus: row.settlementStatus,
        releasedAt: row.releasedAt?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      perPage: query.perPage,
    },
    payouts: payouts.map((payout) => ({
      id: payout.id,
      referenceCode: payout.referenceCode,
      amount: Number(payout.amount),
      status: payout.status,
      note: payout.note,
      transactionRef: payout.transactionRef,
      requestedAt: payout.requestedAt.toISOString(),
      processedAt: payout.processedAt?.toISOString() ?? null,
    })),
  }
}

/**
 * Vendor requests a payout. The RELEASED entries are claimed (payoutId set) in
 * the same transaction — a single earning can never fund two payouts, and an
 * already-claimed entry is invisible to the next request.
 */
export async function requestVendorPayout(
  vendorId: number,
  input: { amount: number; note?: string },
): Promise<{ message: string }> {
  await releaseMaturedEarnings()

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new NotFoundError('Vendor not found.')
  if (!vendor.bankName || !vendor.bankAccountNumber || !vendor.bankAccountName) {
    throw new UnprocessableError(
      'Add your bank account details in Vendor Settings before requesting a payout.',
    )
  }

  const openPayout = await prisma.vendorPayout.findFirst({
    where: { vendorId, status: { in: ['REQUESTED', 'APPROVED'] } },
  })
  if (openPayout) {
    throw new UnprocessableError('You already have a payout request awaiting processing.')
  }

  const requested = round2(input.amount)

  await prisma.$transaction(async (tx) => {
    const available = await tx.commissionLedger.findMany({
      where: { vendorId, settlementStatus: 'RELEASED', payoutId: null },
      orderBy: { releasedAt: 'asc' },
    })
    const availableTotal = round2(available.reduce((sum, row) => sum + Number(row.vendorNet), 0))
    if (requested > availableTotal + 0.01) {
      throw new UnprocessableError(
        `Requested amount exceeds your available balance of ${naira(availableTotal)}.`,
      )
    }

    // Claim entries oldest-first until the requested amount is covered.
    let remaining = requested
    const claimed: number[] = []
    for (const entry of available) {
      if (remaining <= 0.01) break
      claimed.push(entry.id)
      remaining = round2(remaining - Number(entry.vendorNet))
    }

    const payout = await tx.vendorPayout.create({
      data: {
        referenceCode: generateReference('PAY'),
        vendorId,
        amount: requested,
        status: 'REQUESTED',
        note: input.note?.trim() || null,
      },
    })

    await tx.commissionLedger.updateMany({
      where: { id: { in: claimed } },
      data: { payoutId: payout.id },
    })

    await tx.marketplaceAuditLog.create({
      data: {
        actorRole: 'VENDOR',
        actorId: vendorId,
        actorName: vendor.businessName,
        action: 'PAYOUT_REQUESTED',
        entityType: 'VendorPayout',
        entityId: payout.id,
        detail: `${vendor.businessName} requested ${naira(requested)}`,
      },
    })
  })

  return { message: `Payout request for ${naira(requested)} submitted. It will be processed by the administrator.` }
}

export { markOrderPaid }
