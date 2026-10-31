import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'
import type { Paged } from '../types'
import { getMarketplaceSettings, naira } from './marketplaceService'
import { recordPaymentEvent, serializeOrder, type OrderView } from './shopService'
import { releaseMaturedEarnings } from './vendorService'
import type { VendorPublic } from './vendorService'
import type {
  AdminLedgerQuery,
  AdminOrderListQuery,
  AdminVendorListQuery,
  AdminProductListQuery,
  AdminProductInput,
} from '../validators/marketplaceAdmin'

/**
 * Admin marketplace management — vendors, products, orders, settings, ledger,
 * payouts, refunds, reviews and financial reports.
 *
 * Every mutation writes a MarketplaceAuditLog row, and financial transitions
 * keep their history (reversals instead of deletions).
 */

type VendorRow = Prisma.VendorGetPayload<Record<string, never>>

export function serializeVendorForAdmin(vendor: VendorRow): VendorPublic & {
  productCount?: number
  totalSales?: number
} {
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
  }
}

async function audit(entry: {
  actorId: number
  actorName: string
  action: string
  entityType: string
  entityId: number
  detail: string
}): Promise<void> {
  await prisma.marketplaceAuditLog.create({
    data: {
      actorRole: 'ADMIN',
      actorId: entry.actorId,
      actorName: entry.actorName,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      detail: entry.detail,
    },
  })
}

// ─── Vendor applications ─────────────────────────────────────────────────────

export async function adminListVendors(
  query: AdminVendorListQuery,
): Promise<Paged<VendorPublic & { productCount: number; totalSales: number }>> {
  const { offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const where: Prisma.VendorWhereInput = {
    isOfficial: false,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { businessName: { contains: query.search } },
            { contactName: { contains: query.search } },
            { email: { contains: query.search } },
            { phone: { contains: query.search } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.vendor.count({ where }),
  ])

  // Lifetime sales per vendor (from the ledger, excluding reversed rows).
  const salesAgg = await prisma.commissionLedger.groupBy({
    by: ['vendorId'],
    where: { settlementStatus: { not: 'REVERSED' } },
    _sum: { salePrice: true },
  })
  const salesByVendor = new Map(
    salesAgg.map((row) => [row.vendorId, Number(row._sum.salePrice ?? 0)]),
  )

  return {
    items: rows.map((vendor) => ({
      ...serializeVendorForAdmin(vendor),
      productCount: vendor._count.products,
      totalSales: Math.round((salesByVendor.get(vendor.id) ?? 0) * 100) / 100,
    })),
    total,
    page: query.page,
    perPage: query.perPage,
  }
}

export async function adminGetVendor(id: number): Promise<VendorPublic & { productCount: number }> {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: { _count: { select: { products: true, orderItems: true } } },
  })
  if (!vendor) throw new NotFoundError('Vendor not found.')
  return {
    ...serializeVendorForAdmin(vendor),
    productCount: vendor._count.products,
  }
}

export async function adminUpdateVendorStatus(
  id: number,
  input: { status: 'APPROVED' | 'SUSPENDED' | 'REJECTED' | 'PENDING'; reason?: string; commissionRate?: number | null },
  admin: { id: number; name: string },
): Promise<VendorPublic> {
  const vendor = await prisma.vendor.findUnique({ where: { id } })
  if (!vendor) throw new NotFoundError('Vendor not found.')

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.vendor.update({
      where: { id },
      data: {
        status: input.status,
        statusReason: input.reason?.trim() || null,
        ...(input.status === 'APPROVED'
          ? { approvedAt: vendor.approvedAt ?? new Date(), approvedByAdminId: admin.id, suspendedAt: null }
          : {}),
        ...(input.status === 'SUSPENDED' ? { suspendedAt: new Date() } : {}),
        ...(input.commissionRate !== undefined ? { commissionRate: input.commissionRate } : {}),
      },
    })

    if (input.status !== 'APPROVED') {
      // Non-approved vendors' products leave the public shop immediately.
      await tx.product.updateMany({
        where: { vendorId: id, status: 'ACTIVE' },
        data: { isActive: false },
      })
    }
    if (input.status === 'APPROVED' && vendor.status !== 'APPROVED') {
      await tx.product.updateMany({
        where: { vendorId: id, status: 'PENDING_REVIEW' },
        data: { status: 'ACTIVE', isActive: true, approvedAt: new Date(), rejectionReason: null },
      })
    }

    await tx.vendorNotification.create({
      data: {
        vendorId: id,
        type: 'SYSTEM',
        title: `Vendor application ${input.status.toLowerCase().replace('_', ' ')}`,
        message:
          input.status === 'APPROVED'
            ? 'Congratulations! Your vendor account has been approved. You can now list products for sale.'
            : input.status === 'REJECTED'
              ? `Your vendor application was rejected.${input.reason ? ` Reason: ${input.reason}` : ''}`
              : input.status === 'SUSPENDED'
                ? `Your vendor account has been suspended.${input.reason ? ` Reason: ${input.reason}` : ''}`
                : 'Your vendor account has been moved back to pending review.',
      },
    })

    return result
  })

  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: `VENDOR_${input.status}`,
    entityType: 'Vendor',
    entityId: id,
    detail: `${vendor.businessName} → ${input.status}${input.reason ? ` (${input.reason})` : ''}`,
  })

  return serializeVendorForAdmin(updated)
}

// ─── Products ────────────────────────────────────────────────────────────────

export interface AdminProductView {
  id: number
  name: string
  slug: string
  description: string
  sku: string | null
  brand: string | null
  price: number
  compareAtPrice: number | null
  stock: number
  status: string
  isActive: boolean
  rating: number
  reviewCount: number
  salesCount: number
  rejectionReason: string | null
  createdAt: string
  vendor: { id: number; businessName: string; status: string; isOfficial: boolean }
  category: { id: number; name: string } | null
  images: Array<{ id: number; url: string }>
}

const adminProductInclude = {
  vendor: { select: { id: true, businessName: true, status: true, isOfficial: true } },
  category: { select: { id: true, name: true } },
  images: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, url: true } },
} as const

type AdminProductWithRelations = Prisma.ProductGetPayload<{ include: typeof adminProductInclude }>

function serializeAdminProduct(row: AdminProductWithRelations): AdminProductView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sku: row.sku,
    brand: row.brand,
    price: Number(row.price),
    compareAtPrice: row.compareAtPrice === null ? null : Number(row.compareAtPrice),
    stock: row.stock,
    status: row.status,
    isActive: row.isActive,
    rating: Number(row.rating),
    reviewCount: row.reviewCount,
    salesCount: row.salesCount,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    vendor: row.vendor,
    category: row.category,
    images: row.images,
  }
}

export async function adminListProducts(
  query: AdminProductListQuery,
): Promise<Paged<AdminProductView>> {
  const { offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const where: Prisma.ProductWhereInput = {
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { brand: { contains: query.search } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: adminProductInclude,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.product.count({ where }),
  ])

  return {
    items: rows.map(serializeAdminProduct),
    total,
    page: query.page,
    perPage: query.perPage,
  }
}

async function getAdminProductView(productId: number): Promise<AdminProductView> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: adminProductInclude,
  })
  if (!product) throw new NotFoundError('Product not found.')
  return serializeAdminProduct(product)
}

const OFFICIAL_VENDOR_SLUG = 'sawaba-grooming-studio-official-store'

async function getOfficialStore() {
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)
  return prisma.vendor.upsert({
    where: { slug: OFFICIAL_VENDOR_SLUG },
    update: {
      businessName: 'Sawaba Grooming Studio Official Store',
      status: 'APPROVED',
      isActive: true,
      isOfficial: true,
      commissionRate: 100,
    },
    create: {
      businessName: 'Sawaba Grooming Studio Official Store',
      contactName: 'Sawaba Grooming Studio',
      slug: OFFICIAL_VENDOR_SLUG,
      email: 'official-store@sawabasalon.invalid',
      phone: '0000000000',
      passwordHash,
      status: 'APPROVED',
      isActive: true,
      isOfficial: true,
      commissionRate: 100,
      approvedAt: new Date(),
    },
  })
}

function productSlugBase(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200) || 'product'
}

async function uniqueAdminProductSlug(name: string): Promise<string> {
  const base = productSlugBase(name)
  let slug = base
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await prisma.product.findUnique({ where: { slug }, select: { id: true } }))) return slug
    slug = `${base}-${Math.random().toString(36).slice(2, 7)}`
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function adminCreateProduct(
  input: AdminProductInput,
  uploadedImageUrls: string[],
  admin: { id: number; name: string },
): Promise<AdminProductView> {
  const images = [...(input.existingImages ?? []), ...uploadedImageUrls]
  if (images.length === 0) throw new UnprocessableError('Upload at least one product image.')
  if (images.length > 8) throw new UnprocessableError('A maximum of 8 product images is allowed.')

  if (input.categoryId) {
    const category = await prisma.productCategory.findFirst({
      where: { id: input.categoryId, isActive: true },
      select: { id: true },
    })
    if (!category) throw new UnprocessableError('Select an active product category.')
  }

  const vendor = await getOfficialStore()
  const status = input.status
  const created = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: input.categoryId ?? null,
      name: input.name,
      slug: await uniqueAdminProductSlug(input.name),
      sku: input.sku?.trim() || null,
      description: input.description,
      brand: input.brand?.trim() || null,
      price: input.price,
      compareAtPrice: input.compareAtPrice ?? null,
      stock: input.stock,
      status,
      isActive: status === 'ACTIVE' && input.isActive,
      approvedAt: status === 'ACTIVE' ? new Date() : null,
      images: {
        create: images.map((url, sortOrder) => ({
          url,
          sortOrder,
          alt: `${input.name} image ${sortOrder + 1}`,
        })),
      },
    },
  })

  if (input.stock > 0) {
    await prisma.stockMovement.create({
      data: {
        productId: created.id,
        vendorId: vendor.id,
        change: input.stock,
        reason: 'RESTOCK',
        note: 'Initial official-store stock',
        actorRole: 'ADMIN',
        actorId: admin.id,
      },
    })
  }
  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: status === 'ACTIVE' ? 'OFFICIAL_PRODUCT_PUBLISHED' : 'OFFICIAL_PRODUCT_DRAFTED',
    entityType: 'Product',
    entityId: created.id,
    detail: created.name,
  })

  return getAdminProductView(created.id)
}

export async function adminUpdateProduct(
  productId: number,
  input: AdminProductInput,
  uploadedImageUrls: string[],
  admin: { id: number; name: string },
): Promise<AdminProductView> {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new NotFoundError('Product not found.')
  const images = [...(input.existingImages ?? []), ...uploadedImageUrls]
  if (images.length === 0) throw new UnprocessableError('A product must have at least one image.')
  if (images.length > 8) throw new UnprocessableError('A maximum of 8 product images is allowed.')

  if (input.categoryId) {
    const category = await prisma.productCategory.findFirst({
      where: { id: input.categoryId, isActive: true },
      select: { id: true },
    })
    if (!category) throw new UnprocessableError('Select an active product category.')
  }

  const status = input.status
  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        categoryId: input.categoryId ?? null,
        name: input.name,
        sku: input.sku?.trim() || null,
        description: input.description,
        brand: input.brand?.trim() || null,
        price: input.price,
        compareAtPrice: input.compareAtPrice ?? null,
        stock: input.stock,
        status,
        isActive: status === 'ACTIVE' && input.isActive,
        approvedAt: status === 'ACTIVE' ? product.approvedAt ?? new Date() : null,
      },
    })
    await tx.productImage.deleteMany({ where: { productId } })
    await tx.productImage.createMany({
      data: images.map((url, sortOrder) => ({
        productId,
        url,
        sortOrder,
        alt: `${input.name} image ${sortOrder + 1}`,
      })),
    })
    if (input.stock !== product.stock) {
      await tx.stockMovement.create({
        data: {
          productId,
          vendorId: product.vendorId,
          change: input.stock - product.stock,
          reason: 'ADJUSTMENT',
          note: 'Stock edited by admin',
          actorRole: 'ADMIN',
          actorId: admin.id,
        },
      })
    }
  })
  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: 'PRODUCT_UPDATED',
    entityType: 'Product',
    entityId: productId,
    detail: `${product.name} → ${input.name}`,
  })
  return getAdminProductView(productId)
}

export async function adminSetProductAvailability(
  productId: number,
  isActive: boolean,
  admin: { id: number; name: string },
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      status: true,
      vendor: { select: { status: true, isActive: true } },
    },
  })
  if (!product) throw new NotFoundError('Product not found.')
  if (isActive && product.status !== 'ACTIVE') {
    throw new UnprocessableError('Only published products can be made available.')
  }
  if (isActive && (product.vendor.status !== 'APPROVED' || !product.vendor.isActive)) {
    throw new UnprocessableError('Products can only be made available for active, approved vendors.')
  }
  await prisma.product.update({ where: { id: productId }, data: { isActive } })
  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: isActive ? 'PRODUCT_ENABLED' : 'PRODUCT_DISABLED',
    entityType: 'Product',
    entityId: productId,
    detail: product.name,
  })
}

export async function adminModerateProduct(
  productId: number,
  action: 'APPROVED' | 'REJECTED',
  reason: string | undefined,
  admin: { id: number; name: string },
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      vendorId: true,
      vendor: { select: { status: true, isActive: true } },
    },
  })
  if (!product) throw new NotFoundError('Product not found.')
  if (action === 'APPROVED' && (product.vendor.status !== 'APPROVED' || !product.vendor.isActive)) {
    throw new UnprocessableError('Products can only be approved for active, approved vendors.')
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data:
        action === 'APPROVED'
          ? { status: 'ACTIVE', isActive: true, approvedAt: new Date(), rejectionReason: null }
          : { status: 'REJECTED', isActive: false, rejectionReason: reason?.trim() || 'Rejected by admin' },
    })
    await tx.vendorNotification.create({
      data: {
        vendorId: product.vendorId,
        type: 'PRODUCT',
        title: action === 'APPROVED' ? 'Product approved' : 'Product rejected',
        message:
          action === 'APPROVED'
            ? `"${product.name}" is now live in the shop.`
            : `"${product.name}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
      },
    })
  })

  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: `PRODUCT_${action}`,
    entityType: 'Product',
    entityId: productId,
    detail: `${product.name} → ${action}`,
  })
}

export async function adminDeleteProduct(
  productId: number,
  admin: { id: number; name: string },
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, orderItems: { select: { id: true }, take: 1 } },
  })
  if (!product) throw new NotFoundError('Product not found.')

  if (product.orderItems.length > 0) {
    await prisma.product.update({
      where: { id: productId },
      data: { status: 'ARCHIVED', isActive: false },
    })
  } else {
    await prisma.product.delete({ where: { id: productId } })
  }

  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: 'PRODUCT_DELETED',
    entityType: 'Product',
    entityId: productId,
    detail: product.name,
  })
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function adminListCategories(includeInactive = true) {
  return prisma.productCategory.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: { _count: { select: { products: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

export async function adminCreateCategory(
  input: { name: string; description?: string; commissionRate?: number | null; isActive?: boolean; sortOrder?: number },
  admin: { id: number; name: string },
) {
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 130)
  const category = await prisma.productCategory.create({
    data: {
      name: input.name,
      slug,
      description: input.description?.trim() || null,
      commissionRate: input.commissionRate ?? null,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  })
  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: 'CATEGORY_CREATED',
    entityType: 'ProductCategory',
    entityId: category.id,
    detail: input.name,
  })
  return category
}

export async function adminUpdateCategory(
  id: number,
  input: { name?: string; description?: string; commissionRate?: number | null; isActive?: boolean; sortOrder?: number },
  admin: { id: number; name: string },
) {
  const existing = await prisma.productCategory.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Category not found.')
  const updated = await prisma.productCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
      ...(input.commissionRate !== undefined ? { commissionRate: input.commissionRate } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  })
  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: 'CATEGORY_UPDATED',
    entityType: 'ProductCategory',
    entityId: id,
    detail: input.name ?? existing.name,
  })
  return updated
}

export async function adminDeleteCategory(id: number, admin: { id: number; name: string }): Promise<void> {
  const existing = await prisma.productCategory.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { products: true } } },
  })
  if (!existing) throw new NotFoundError('Category not found.')
  await prisma.productCategory.delete({ where: { id } })
  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: 'CATEGORY_DELETED',
    entityType: 'ProductCategory',
    entityId: id,
    detail: existing.name,
  })
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface AdminOrderRow extends OrderView {
  items: Array<
    OrderView['items'][number] & {
      commissionRate: number
      commissionAmount: number
      vendorNet: number
    }
  >
  vendorIds: number[]
  vendorNames: string[]
  paymentVerifiedAt: string | null
  paymentNote: string | null
  cancelledAt: string | null
  deliveredAt: string | null
  refundedAt: string | null
}

function serializeAdminOrder(
  order: Parameters<typeof serializeOrder>[0],
): AdminOrderRow {
  const base = serializeOrder(order)
  return {
    ...base,
    items: base.items.map((serializedItem) => {
      const item = order.items.find((orderItem) => orderItem.id === serializedItem.id)
      if (!item) throw new Error(`Order item ${serializedItem.id} is missing from its source order.`)
      return {
        ...serializedItem,
        commissionRate: Number(item.commissionRate),
        commissionAmount: Number(item.commissionAmount),
        vendorNet: Number(item.vendorNet),
      }
    }),
    vendorIds: [...new Set(order.items.map((item) => item.vendorId))],
    vendorNames: [...new Set(order.items.map((item) => item.vendor.businessName))],
    paymentVerifiedAt: order.paymentVerifiedAt?.toISOString() ?? null,
    paymentNote: order.paymentNote,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    refundedAt: order.refundedAt?.toISOString() ?? null,
  }
}

export async function adminListOrders(
  query: AdminOrderListQuery,
): Promise<Paged<AdminOrderRow>> {
  const { offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const where: Prisma.ShopOrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(query.vendorId ? { items: { some: { vendorId: query.vendorId } } } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { referenceCode: { contains: query.search } },
            { customerName: { contains: query.search } },
            { customerPhone: { contains: query.search } },
            { customerEmail: { contains: query.search } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.shopOrder.findMany({
      where,
      include: {
        items: { include: { vendor: { select: { id: true, businessName: true } } }, orderBy: { id: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.shopOrder.count({ where }),
  ])

  return { items: rows.map(serializeAdminOrder), total, page: query.page, perPage: query.perPage }
}

export async function adminGetOrder(reference: string): Promise<AdminOrderRow & {
  events: Array<{ id: number; type: string; status: string; detail: string | null; actorRole: string | null; createdAt: string }>
  refunds: Array<{ id: number; reason: string; amount: number; status: string; requestedBy: string; createdAt: string }>
  ledger: Array<{ id: number; vendorId: number; commissionAmount: number; vendorNet: number; settlementStatus: string }>
} | null> {
  const order = await prisma.shopOrder.findUnique({
    where: { referenceCode: reference.toUpperCase() },
    include: {
      items: { include: { vendor: { select: { id: true, businessName: true } } }, orderBy: { id: 'asc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 30 },
      refunds: { orderBy: { createdAt: 'desc' } },
      ledger: { select: { id: true, vendorId: true, commissionAmount: true, vendorNet: true, settlementStatus: true } },
    },
  })
  if (!order) return null
  return {
    ...serializeAdminOrder(order),
    events: order.events.map((event) => ({
      id: event.id,
      type: event.type,
      status: event.status,
      detail: event.detail,
      actorRole: event.actorRole,
      createdAt: event.createdAt.toISOString(),
    })),
    refunds: order.refunds.map((refund) => ({
      id: refund.id,
      reason: refund.reason,
      amount: Number(refund.amount),
      status: refund.status,
      requestedBy: refund.requestedBy,
      createdAt: refund.createdAt.toISOString(),
    })),
    ledger: order.ledger.map((entry) => ({
      id: entry.id,
      vendorId: entry.vendorId,
      commissionAmount: Number(entry.commissionAmount),
      vendorNet: Number(entry.vendorNet),
      settlementStatus: entry.settlementStatus,
    })),
  }
}

export async function adminUpdateOrderStatus(
  reference: string,
  input: { status: string; reason?: string },
  admin: { id: number; name: string },
): Promise<AdminOrderRow> {
  const order = await prisma.shopOrder.findUnique({
    where: { referenceCode: reference.toUpperCase() },
    include: { items: { select: { id: true, status: true, vendorId: true } } },
  })
  if (!order) throw new NotFoundError('Order not found.')
  if (order.paymentStatus !== 'PAID' && !['CANCELLED'].includes(input.status)) {
    throw new UnprocessableError('Only paid orders can move through fulfillment.')
  }
  const allowedTransitions: Record<string, string[]> = {
    PAYMENT_CONFIRMED: ['PROCESSING', 'READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    PROCESSING: ['READY_FOR_DISPATCH', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    READY_FOR_DISPATCH: ['SHIPPED', 'DELIVERED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'CANCELLED'],
  }
  if (input.status !== 'CANCELLED' && !allowedTransitions[order.status]?.includes(input.status)) {
    throw new UnprocessableError(`Cannot move this order from ${order.status} to ${input.status}.`)
  }
  if (['CANCELLED', 'DELIVERED', 'REFUNDED', 'RETURNED'].includes(order.status)) {
    throw new UnprocessableError(`This order is already ${order.status.toLowerCase()}.`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.ShopOrderUpdateInput = { status: input.status as never }
    if (input.status === 'DELIVERED') data.deliveredAt = new Date()
    if (input.status === 'CANCELLED') {
      data.cancelledAt = new Date()
      data.cancelReason = input.reason || 'Cancelled by admin'
    }
    const result = await tx.shopOrder.update({
      where: { id: order.id },
      data,
      include: {
        items: { include: { vendor: { select: { id: true, businessName: true } } }, orderBy: { id: 'asc' } },
      },
    })

    if (input.status === 'CANCELLED' && order.paymentStatus === 'PAID') {
      // Full paid-order cancellation → reverse every ledger entry not yet paid out.
      const ledgerEntries = await tx.commissionLedger.findMany({ where: { orderId: order.id } })
      for (const entry of ledgerEntries) {
        if (entry.settlementStatus === 'REVERSED') continue
        if (entry.settlementStatus === 'PAID') {
          await tx.commissionLedger.update({
            where: { id: entry.id },
            data: { reversedAmount: entry.vendorNet },
          })
        } else {
          await tx.commissionLedger.update({
            where: { id: entry.id },
            data: { settlementStatus: 'REVERSED', reversedAmount: entry.vendorNet, payoutId: null, releasedAt: null },
          })
        }
      }
      // Restock products + audit the stock movement.
      for (const item of order.items) {
        if (item.status === 'CANCELLED' || item.status === 'RETURNED') continue
        const line = await tx.shopOrderItem.findUnique({ where: { id: item.id } })
        if (!line) continue
        await tx.product.update({
          where: { id: line.productId },
          data: { stock: { increment: line.quantity } },
        })
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            vendorId: line.vendorId,
            change: line.quantity,
            reason: 'CANCELLATION',
            reference: order.referenceCode,
            actorRole: 'ADMIN',
            actorId: admin.id,
          },
        })
      }
      await tx.shopOrder.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', paymentStatus: 'REFUNDED', refundedAmount: order.totalAmount, refundedAt: new Date() },
      })
      await tx.shopPayment.updateMany({ where: { orderId: order.id }, data: { status: 'REFUNDED' } })
    } else if (input.status === 'CANCELLED') {
      for (const item of order.items) {
        if (item.status === 'CANCELLED' || item.status === 'RETURNED') continue
        const line = await tx.shopOrderItem.findUnique({ where: { id: item.id } })
        if (!line) continue
        await tx.product.update({
          where: { id: line.productId },
          data: { stock: { increment: line.quantity } },
        })
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            vendorId: line.vendorId,
            change: line.quantity,
            reason: 'CANCELLATION',
            reference: order.referenceCode,
            actorRole: 'ADMIN',
            actorId: admin.id,
          },
        })
      }
      await tx.shopOrder.update({
        where: { id: order.id },
        data: { paymentStatus: 'CANCELLED' },
      })
      await tx.shopPayment.updateMany({
        where: { orderId: order.id, status: { not: 'PAID' } },
        data: { status: 'CANCELLED' },
      })
    }

    if (input.status === 'DELIVERED') {
      for (const item of result.items) {
        await tx.shopOrderItem.update({
          where: { id: item.id },
          data: { status: 'DELIVERED', deliveredAt: item.deliveredAt ?? new Date() },
        })
      }
    }
    if (input.status === 'PROCESSING') {
      for (const item of result.items) {
        if (['PENDING', 'CONFIRMED'].includes(item.status)) {
          await tx.shopOrderItem.update({
            where: { id: item.id },
            data: { status: 'PREPARING', confirmedAt: item.confirmedAt ?? new Date() },
          })
        }
      }
    }
    if (input.status === 'SHIPPED') {
      await tx.shopOrderItem.updateMany({
        where: { orderId: order.id, status: { notIn: ['CANCELLED', 'RETURNED', 'DELIVERED'] } },
        data: { status: 'SHIPPED', shippedAt: new Date() },
      })
    }
    if (input.status === 'CANCELLED') {
      await tx.shopOrderItem.updateMany({
        where: { orderId: order.id, status: { notIn: ['CANCELLED', 'RETURNED'] } },
        data: { status: 'CANCELLED', cancelReason: input.reason || 'Cancelled by admin' },
      })
    }

    await recordPaymentEvent(
      order.id,
      {
        type: 'ORDER_STATUS_CHANGED',
        status: input.status,
        actorRole: 'ADMIN',
        actorId: admin.id,
        detail: `${order.status} → ${input.status}${input.reason ? `: ${input.reason}` : ''}`,
      },
      tx,
    )

    return tx.shopOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        items: { include: { vendor: { select: { id: true, businessName: true } } }, orderBy: { id: 'asc' } },
      },
    })
  })

  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: 'ORDER_STATUS_CHANGED',
    entityType: 'ShopOrder',
    entityId: order.id,
    detail: `${order.referenceCode}: ${order.status} → ${input.status}`,
  })

  return serializeAdminOrder(updated)
}

/** Creates a refund request record (customer-facing refund flow entry point). */
export async function adminCreateRefund(
  reference: string,
  input: { reason: string; amount?: number; vendorId?: number },
  admin: { id: number; name: string },
) {
  const order = await prisma.shopOrder.findUnique({
    where: { referenceCode: reference.toUpperCase() },
    include: { ledger: { select: { vendorId: true, vendorNet: true, settlementStatus: true } } },
  })
  if (!order) throw new NotFoundError('Order not found.')
  if (order.paymentStatus !== 'PAID') {
    throw new UnprocessableError('Only paid orders can be refunded.')
  }

  const remaining = Number(order.totalAmount) - Number(order.refundedAmount)
  const amount = Math.min(input.amount ?? remaining, remaining)
  if (amount <= 0) {
    throw new UnprocessableError('This order has already been fully refunded.')
  }

  const refund = await prisma.shopRefund.create({
    data: {
      orderId: order.id,
      vendorId: input.vendorId ?? null,
      reason: input.reason,
      amount,
      status: 'REQUESTED',
      requestedBy: `ADMIN:${admin.name}`,
    },
  })

  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: 'REFUND_REQUESTED',
    entityType: 'ShopRefund',
    entityId: refund.id,
    detail: `${order.referenceCode}: ${naira(amount)}`,
  })

  return { id: refund.id, status: refund.status }
}

export async function adminResolveRefund(
  refundId: number,
  input: { action: 'APPROVED' | 'REJECTED'; resolution?: string },
  admin: { id: number; name: string },
): Promise<void> {
  const refund = await prisma.shopRefund.findUnique({
    where: { id: refundId },
    include: { order: { include: { ledger: true } } },
  })
  if (!refund) throw new NotFoundError('Refund record not found.')
  if (refund.status !== 'REQUESTED') {
    throw new UnprocessableError(`This refund was already ${refund.status.toLowerCase()}.`)
  }

  if (input.action === 'REJECTED') {
    await prisma.shopRefund.update({
      where: { id: refundId },
      data: { status: 'REJECTED', resolution: input.resolution?.trim() || 'Rejected by admin', resolvedBy: admin.id, resolvedAt: new Date() },
    })
  } else {
    const { handleLineRefund } = await import('./vendorService')
    await prisma.$transaction(async (tx) => {
      await handleLineRefund(refund.orderId, refund.vendorId, Number(refund.amount), refund.reason, tx)
      await tx.shopRefund.update({
        where: { id: refundId },
        data: { status: 'COMPLETED', resolution: input.resolution?.trim() || 'Refund completed', resolvedBy: admin.id, resolvedAt: new Date() },
      })
    })
  }

  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: `REFUND_${input.action}`,
    entityType: 'ShopRefund',
    entityId: refundId,
    detail: `Order ${refund.order.referenceCode}: ${naira(Number(refund.amount))}`,
  })
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function adminGetMarketplaceSettings() {
  const settings = await getMarketplaceSettings()
  return {
    defaultCommissionRate: Number(settings.defaultCommissionRate),
    commissionType: settings.commissionType,
    releaseDelayDays: settings.releaseDelayDays,
    deliveryFee: Number(settings.deliveryFee),
    freeDeliveryThreshold: Number(settings.freeDeliveryThreshold),
    deliveryLocations: settings.deliveryLocations,
    requireProductApproval: settings.requireProductApproval,
    allowGuestCheckout: settings.allowGuestCheckout,
    vendorRegistrationOpen: settings.vendorRegistrationOpen,
    updatedAt: settings.updatedAt.toISOString(),
  }
}

export async function adminUpdateMarketplaceSettings(
  input: {
    defaultCommissionRate: number
    commissionType: 'PERCENTAGE' | 'FIXED'
    releaseDelayDays: number
    deliveryFee: number
    freeDeliveryThreshold: number
    deliveryLocations?: string
    requireProductApproval: boolean
    allowGuestCheckout: boolean
    vendorRegistrationOpen: boolean
  },
  admin: { id: number; name: string },
) {
  await getMarketplaceSettings()
  const updated = await prisma.marketplaceSetting.update({
    where: { id: 1 },
    data: {
      defaultCommissionRate: input.defaultCommissionRate,
      commissionType: input.commissionType,
      releaseDelayDays: input.releaseDelayDays,
      deliveryFee: input.deliveryFee,
      freeDeliveryThreshold: input.freeDeliveryThreshold,
      deliveryLocations: input.deliveryLocations ?? '',
      requireProductApproval: input.requireProductApproval,
      allowGuestCheckout: input.allowGuestCheckout,
      vendorRegistrationOpen: input.vendorRegistrationOpen,
    },
  })
  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: 'SETTINGS_UPDATED',
    entityType: 'MarketplaceSetting',
    entityId: updated.id,
    detail: `Commission ${input.commissionType === 'FIXED' ? naira(input.defaultCommissionRate) : `${input.defaultCommissionRate}%`}`,
  })
  return adminGetMarketplaceSettings()
}

// ─── Commission ledger ───────────────────────────────────────────────────────

export async function adminListLedger(query: AdminLedgerQuery) {
  const { offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const where: Prisma.CommissionLedgerWhereInput = {
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    ...(query.settlementStatus ? { settlementStatus: query.settlementStatus as never } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }

  const [rows, total, totals] = await Promise.all([
    prisma.commissionLedger.findMany({
      where,
      include: {
        vendor: { select: { id: true, businessName: true } },
        product: { select: { name: true } },
        order: { select: { referenceCode: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.commissionLedger.count({ where }),
    prisma.commissionLedger.aggregate({
      where,
      _sum: { salePrice: true, commissionAmount: true, vendorNet: true, reversedAmount: true },
    }),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      orderReference: row.order.referenceCode,
      vendorId: row.vendorId,
      vendorName: row.vendor.businessName,
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
    totals: {
      salePrice: Number(totals._sum.salePrice ?? 0),
      commissionAmount: Number(totals._sum.commissionAmount ?? 0),
      vendorNet: Number(totals._sum.vendorNet ?? 0),
      reversedAmount: Number(totals._sum.reversedAmount ?? 0),
    },
  }
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

export async function adminListPayouts(query: {
  status?: string
  vendorId?: number
  page: number
  perPage: number
}) {
  await releaseMaturedEarnings()
  const { offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const where: Prisma.VendorPayoutWhereInput = {
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.vendorPayout.findMany({
      where,
      include: { vendor: { select: { id: true, businessName: true, bankName: true, bankAccountName: true, bankAccountNumber: true } } },
      orderBy: { requestedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.vendorPayout.count({ where }),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      referenceCode: row.referenceCode,
      vendorId: row.vendorId,
      vendorName: row.vendor.businessName,
      bankName: row.vendor.bankName,
      accountName: row.vendor.bankAccountName,
      accountNumber: row.vendor.bankAccountNumber,
      amount: Number(row.amount),
      status: row.status,
      note: row.note,
      transactionRef: row.transactionRef,
      requestedAt: row.requestedAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
    })),
    total,
    page: query.page,
    perPage: query.perPage,
  }
}

/**
 * Processes a payout request:
 *   APPROVED → the claimed ledger entries stay reserved (not yet paid).
 *   PAID     → entries become PAID (settled); must follow APPROVED.
 *   REJECTED → claimed entries are released back to the available balance.
 * Claimed-entry uniqueness prevents any earning funding two payouts.
 */
export async function adminProcessPayout(
  payoutId: number,
  input: { action: 'APPROVED' | 'REJECTED' | 'PAID'; transactionRef?: string; note?: string },
  admin: { id: number; name: string },
): Promise<void> {
  const payout = await prisma.vendorPayout.findUnique({
    where: { id: payoutId },
    include: { vendor: { select: { businessName: true } } },
  })
  if (!payout) throw new NotFoundError('Payout not found.')

  const transitions: Record<string, string[]> = {
    REQUESTED: ['APPROVED', 'REJECTED'],
    APPROVED: ['PAID', 'REJECTED'],
    PAID: [],
    REJECTED: [],
  }
  if (!transitions[payout.status]?.includes(input.action)) {
    throw new UnprocessableError(`A ${payout.status.toLowerCase()} payout cannot become ${input.action.toLowerCase()}.`)
  }

  await prisma.$transaction(async (tx) => {
    if (input.action === 'REJECTED') {
      // Release the claim so the balance returns to the vendor.
      await tx.commissionLedger.updateMany({
        where: { payoutId: payout.id, settlementStatus: 'RELEASED' },
        data: { payoutId: null },
      })
      await tx.vendorPayout.update({
        where: { id: payout.id },
        data: {
          status: 'REJECTED',
          note: input.note?.trim() || payout.note,
          processedAt: new Date(),
          processedByAdminId: admin.id,
        },
      })
    } else if (input.action === 'APPROVED') {
      await tx.vendorPayout.update({
        where: { id: payout.id },
        data: { status: 'APPROVED', processedByAdminId: admin.id, processedAt: new Date() },
      })
    } else {
      const claimed = await tx.commissionLedger.findMany({
        where: { payoutId: payout.id },
      })
      const claimedTotal = claimed.reduce((sum, row) => sum + Number(row.vendorNet), 0)
      if (Math.abs(claimedTotal - Number(payout.amount)) > 1) {
        throw new UnprocessableError(
          `Payout total mismatch (entries sum ${naira(claimedTotal)} vs requested ${naira(Number(payout.amount))}). Please reject and ask the vendor to re-request.`,
        )
      }
      await tx.commissionLedger.updateMany({
        where: { payoutId: payout.id },
        data: { settlementStatus: 'PAID', paidAt: new Date() },
      })
      await tx.vendorPayout.update({
        where: { id: payout.id },
        data: {
          status: 'PAID',
          transactionRef: input.transactionRef?.trim() || payout.transactionRef,
          processedAt: new Date(),
          processedByAdminId: admin.id,
        },
      })
    }

    await tx.vendorNotification.create({
      data: {
        vendorId: payout.vendorId,
        type: 'PAYOUT',
        title: `Payout ${input.action.toLowerCase()}`,
        message:
          input.action === 'PAID'
            ? `Your payout of ${naira(Number(payout.amount))} (${payout.referenceCode}) has been paid.`
            : input.action === 'APPROVED'
              ? `Your payout of ${naira(Number(payout.amount))} (${payout.referenceCode}) has been approved and is being processed.`
              : `Your payout request ${payout.referenceCode} was rejected.${input.note ? ` Note: ${input.note}` : ''} The funds are back in your available balance.`,
      },
    })
  })

  await audit({
    actorId: admin.id,
    actorName: admin.name,
    action: `PAYOUT_${input.action}`,
    entityType: 'VendorPayout',
    entityId: payout.id,
    detail: `${payout.vendor.businessName}: ${naira(Number(payout.amount))}`,
  })
}

// ─── Reviews moderation ──────────────────────────────────────────────────────

export async function adminListProductReviews(query: {
  status?: string
  search?: string
  page: number
  perPage: number
}) {
  const { offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const where: Prisma.ProductReviewWhereInput = {
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search
      ? {
          OR: [
            { customerName: { contains: query.search } },
            { product: { name: { contains: query.search } } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.productReview.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
        vendor: { select: { id: true, businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.productReview.count({ where }),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      vendorId: row.vendorId,
      vendorName: row.vendor.businessName,
      customerName: row.customerName,
      rating: row.rating,
      comment: row.comment,
      status: row.status,
      reply: row.reply,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    perPage: query.perPage,
  }
}

export async function adminModerateProductReview(
  reviewId: number,
  action: 'APPROVED' | 'REJECTED',
): Promise<void> {
  const review = await prisma.productReview.findUnique({ where: { id: reviewId } })
  if (!review) throw new NotFoundError('Review not found.')

  await prisma.productReview.update({
    where: { id: reviewId },
    data: { status: action, isApproved: action === 'APPROVED' },
  })

  const { refreshProductRating } = await import('./shopService')
  await refreshProductRating(review.productId)
}

// ─── Overview + reports ──────────────────────────────────────────────────────

export interface MarketplaceOverview {
  vendors: { total: number; pending: number; approved: number; suspended: number; rejected: number }
  products: { total: number; active: number; pendingReview: number; outOfStock: number }
  orders: {
    total: number
    awaitingPayment: number
    paymentPendingVerification: number
    paid: number
    processing: number
    delivered: number
    cancelled: number
    refunded: number
  }
  finance: {
    grossSales: number
    successfulPayments: number
    pendingPayments: number
    marketplaceCommission: number
    vendorLiability: number
    completedPayouts: number
    refunds: number
    netMarketplaceRevenue: number
  }
  recentOrders: Array<{
    referenceCode: string
    customerName: string
    totalAmount: number
    status: string
    paymentStatus: string
    createdAt: string
  }>
  pendingVendorApplications: Array<{ id: number; businessName: string; contactName: string; createdAt: string }>
}

export async function adminGetOverview(): Promise<MarketplaceOverview> {
  await releaseMaturedEarnings()

  const [
    vendorGroups,
    productGroups,
    outOfStock,
    orderGroups,
    paymentGroups,
    ledgerTotals,
    paidOrderAgg,
    pendingPaymentAgg,
    refundAgg,
    payoutAgg,
    recentOrders,
    pendingVendors,
  ] = await Promise.all([
    prisma.vendor.groupBy({ by: ['status'], where: { isOfficial: false }, _count: { _all: true } }),
    prisma.product.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.product.count({ where: { stock: 0, status: 'ACTIVE' } }),
    prisma.shopOrder.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.shopOrder.groupBy({ by: ['paymentStatus'], _count: { _all: true } }),
    prisma.commissionLedger.aggregate({
      where: { settlementStatus: { not: 'REVERSED' } },
      _sum: { salePrice: true, commissionAmount: true, vendorNet: true },
    }),
    prisma.shopOrder.aggregate({
      where: { paymentStatus: 'PAID', status: { not: 'REFUNDED' } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.shopOrder.aggregate({
      where: { paymentStatus: 'PENDING_VERIFICATION' },
      _sum: { totalAmount: true },
    }),
    prisma.shopRefund.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
    }),
    prisma.vendorPayout.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true },
    }),
    prisma.shopOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        referenceCode: true,
        customerName: true,
        totalAmount: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
      },
    }),
    prisma.vendor.findMany({
      where: { status: 'PENDING', isOfficial: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, businessName: true, contactName: true, createdAt: true },
    }),
  ])

  const groupCount = (rows: Array<{ status: string; _count: { _all: number } }>, status: string) =>
    rows.find((row) => row.status === status)?._count._all ?? 0

  const grossSales = Number(ledgerTotals._sum.salePrice ?? 0)
  const commission = Number(ledgerTotals._sum.commissionAmount ?? 0)
  const vendorLiability = Number(ledgerTotals._sum.vendorNet ?? 0)
  const refunds = Number(refundAgg._sum.amount ?? 0)
  const successfulPayments = Number(paidOrderAgg._sum.totalAmount ?? 0)
  const pendingPayments = Number(pendingPaymentAgg._sum.totalAmount ?? 0)

  const round2 = (value: number) => Math.round(value * 100) / 100

  return {
    vendors: {
      total: vendorGroups.reduce((sum, row) => sum + row._count._all, 0),
      pending: groupCount(vendorGroups as never, 'PENDING'),
      approved: groupCount(vendorGroups as never, 'APPROVED'),
      suspended: groupCount(vendorGroups as never, 'SUSPENDED'),
      rejected: groupCount(vendorGroups as never, 'REJECTED'),
    },
    products: {
      total: productGroups.reduce((sum, row) => sum + row._count._all, 0),
      active: groupCount(productGroups as never, 'ACTIVE'),
      pendingReview: groupCount(productGroups as never, 'PENDING_REVIEW'),
      outOfStock,
    },
    orders: {
      total: orderGroups.reduce((sum, row) => sum + row._count._all, 0),
      awaitingPayment: groupCount(orderGroups as never, 'AWAITING_PAYMENT'),
      paymentPendingVerification: groupCount(paymentGroups as never, 'PENDING_VERIFICATION'),
      paid: groupCount(paymentGroups as never, 'PAID'),
      processing: groupCount(orderGroups as never, 'PROCESSING') + groupCount(orderGroups as never, 'READY_FOR_DISPATCH') + groupCount(orderGroups as never, 'SHIPPED'),
      delivered: groupCount(orderGroups as never, 'DELIVERED'),
      cancelled: groupCount(orderGroups as never, 'CANCELLED'),
      refunded: groupCount(orderGroups as never, 'REFUNDED'),
    },
    finance: {
      grossSales: round2(grossSales),
      successfulPayments: round2(successfulPayments),
      pendingPayments: round2(pendingPayments),
      marketplaceCommission: round2(commission),
      vendorLiability: round2(vendorLiability),
      completedPayouts: round2(Number(payoutAgg._sum.amount ?? 0)),
      refunds: round2(refunds),
      netMarketplaceRevenue: round2(commission - refunds),
    },
    recentOrders: recentOrders.map((order) => ({
      referenceCode: order.referenceCode,
      customerName: order.customerName,
      totalAmount: Number(order.totalAmount),
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
    })),
    pendingVendorApplications: pendingVendors.map((vendor) => ({
      id: vendor.id,
      businessName: vendor.businessName,
      contactName: vendor.contactName,
      createdAt: vendor.createdAt.toISOString(),
    })),
  }
}

/** CSV export of marketplace orders (financial reporting). */
export async function adminExportOrdersCsv(
  query: { from?: string; to?: string; vendorId?: number },
): Promise<string> {
  const where: Prisma.ShopOrderWhereInput = {
    ...(query.vendorId ? { items: { some: { vendorId: query.vendorId } } } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }

  const orders = await prisma.shopOrder.findMany({
    where,
    include: {
      items: { include: { vendor: { select: { businessName: true } } } },
      ledger: { select: { vendorId: true, commissionAmount: true, vendorNet: true, settlementStatus: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  })

  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  const header = [
    'Order Reference',
    'Date',
    'Customer',
    'Phone',
    'Email',
    'Delivery Location',
    'Subtotal',
    'Delivery Fee',
    'Total',
    'Payment Method',
    'Payment Status',
    'Order Status',
    'Vendors',
    'Commission',
    'Vendor Net',
    'Refunded',
  ]

  const lines = orders.map((order) =>
    [
      order.referenceCode,
      order.createdAt.toISOString().slice(0, 10),
      order.customerName,
      order.customerPhone,
      order.customerEmail ?? '',
      order.deliveryLocation ?? '',
      Number(order.subtotal).toFixed(2),
      Number(order.deliveryFee).toFixed(2),
      Number(order.totalAmount).toFixed(2),
      order.paymentMethod ?? '',
      order.paymentStatus,
      order.status,
      [...new Set(order.items.map((item) => item.vendor.businessName))].join(' + '),
      order.ledger
        .filter((entry) => entry.settlementStatus !== 'REVERSED')
        .reduce((sum, entry) => sum + Number(entry.commissionAmount), 0)
        .toFixed(2),
      order.ledger
        .filter((entry) => entry.settlementStatus !== 'REVERSED')
        .reduce((sum, entry) => sum + Number(entry.vendorNet), 0)
        .toFixed(2),
      Number(order.refundedAmount).toFixed(2),
    ]
      .map(escape)
      .join(','),
  )

  return [header.join(','), ...lines].join('\n')
}

/** CSV export of the commission ledger. */
export async function adminExportLedgerCsv(query: { from?: string; to?: string; vendorId?: number }): Promise<string> {
  const where: Prisma.CommissionLedgerWhereInput = {
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }
  const rows = await prisma.commissionLedger.findMany({
    where,
    include: {
      vendor: { select: { businessName: true } },
      product: { select: { name: true } },
      order: { select: { referenceCode: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })

  const header = [
    'Order Reference',
    'Date',
    'Vendor',
    'Product',
    'Qty',
    'Sale Price',
    'Commission Rate',
    'Commission',
    'Vendor Net',
    'Reversed',
    'Settlement',
  ]

  const lines = rows.map((row) =>
    [
      row.order.referenceCode,
      row.createdAt.toISOString().slice(0, 10),
      row.vendor.businessName,
      row.product.name,
      row.quantity,
      Number(row.salePrice).toFixed(2),
      `${Number(row.commissionRate)}%`,
      Number(row.commissionAmount).toFixed(2),
      Number(row.vendorNet).toFixed(2),
      Number(row.reversedAmount).toFixed(2),
      row.settlementStatus,
    ].join(','),
  )

  return [header.join(','), ...lines].join('\n')
}
