import type { NextFunction, Request, Response } from 'express'
import { successRes } from '../utils/response'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import {
  adminCreateCategory,
  adminCreateProduct,
  adminCreateRefund,
  adminDeleteCategory,
  adminDeleteProduct,
  adminExportLedgerCsv,
  adminExportOrdersCsv,
  adminGetMarketplaceSettings,
  adminGetOrder,
  adminGetOverview,
  adminGetVendor,
  adminListCategories,
  adminListLedger,
  adminListOrders,
  adminListPayouts,
  adminListProductReviews,
  adminListProducts,
  adminListVendors,
  adminModerateProduct,
  adminSetProductAvailability,
  adminModerateProductReview,
  adminProcessPayout,
  adminResolveRefund,
  adminUpdateCategory,
  adminUpdateProduct,
  adminUpdateMarketplaceSettings,
  adminUpdateOrderStatus,
  adminUpdateVendorStatus,
} from '../services/adminMarketplaceService'
import { verifyOrderPayment, rejectOrderPayment } from '../services/shopPaymentService'
import { serializeOrder } from '../services/shopService'
import { uploadImageToCloudinary } from '../utils/upload'
import type { AdminProductInput, AdminProductListQuery } from '../validators/marketplaceAdmin'
import type {
  AdminLedgerQuery,
  AdminOrderListQuery,
  AdminVendorListQuery,
} from '../validators/marketplaceAdmin'

function handle(next: NextFunction, run: () => Promise<void>): void {
  run().catch(next)
}

function adminActor(req: Request): { id: number; name: string } {
  return { id: req.admin!.id, name: req.admin!.name }
}

// ─── Overview ────────────────────────────────────────────────────────────────

export const overviewHandler = (_req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    successRes(res, 'Marketplace overview retrieved.', await adminGetOverview())
  })

// ─── Vendors ─────────────────────────────────────────────────────────────────

export const listVendorsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const result = await adminListVendors(req.query as unknown as AdminVendorListQuery)
    successRes(res, 'Vendors retrieved.', result)
  })

export const getVendorHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    successRes(res, 'Vendor retrieved.', await adminGetVendor(Number(req.params.id)))
  })

export const updateVendorStatusHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const body = req.body as {
      status: 'APPROVED' | 'SUSPENDED' | 'REJECTED' | 'PENDING'
      reason?: string
      commissionRate?: number | null
    }
    const vendor = await adminUpdateVendorStatus(Number(req.params.id), body, adminActor(req))
    successRes(res, `Vendor ${body.status.toLowerCase()}.`, vendor)
  })

// ─── Products + categories ───────────────────────────────────────────────────

export const listProductsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const result = await adminListProducts(req.query as unknown as AdminProductListQuery)
    successRes(res, 'Products retrieved.', result)
  })

async function uploadProductImages(req: Request): Promise<string[]> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (files.length > 8) throw new UnprocessableError('A maximum of 8 product images is allowed.')
  const urls: string[] = []
  for (const file of files) {
    const uploaded = await uploadImageToCloudinary(file.buffer, 'sawaba-products', file.mimetype)
    urls.push(uploaded.url)
  }
  return urls
}

export const createProductHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const product = await adminCreateProduct(
      req.body as AdminProductInput,
      await uploadProductImages(req),
      adminActor(req),
    )
    successRes(res, 'Official-store product created.', product, 201)
  })

export const updateProductHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const product = await adminUpdateProduct(
      Number(req.params.id),
      req.body as AdminProductInput,
      await uploadProductImages(req),
      adminActor(req),
    )
    successRes(res, 'Product updated.', product)
  })

export const setProductAvailabilityHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { isActive } = req.body as { isActive: boolean }
    await adminSetProductAvailability(Number(req.params.id), isActive, adminActor(req))
    successRes(res, `Product ${isActive ? 'made available' : 'made unavailable'}.`, {})
  })

export const moderateProductHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { action, reason } = req.body as { action: 'APPROVED' | 'REJECTED'; reason?: string }
    await adminModerateProduct(Number(req.params.id), action, reason, adminActor(req))
    successRes(res, action === 'APPROVED' ? 'Product approved.' : 'Product rejected.', {})
  })

export const deleteProductHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    await adminDeleteProduct(Number(req.params.id), adminActor(req))
    successRes(res, 'Product deleted.', {})
  })

export const listCategoriesHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const includeInactive = req.query.all === '1'
    const categories = await adminListCategories(includeInactive)
    successRes(
      res,
      'Categories retrieved.',
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        commissionRate: category.commissionRate === null ? null : Number(category.commissionRate),
        isActive: category.isActive,
        sortOrder: category.sortOrder,
        productCount: category._count.products,
      })),
    )
  })

export const createCategoryHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const category = await adminCreateCategory(
      req.body as {
        name: string
        description?: string
        commissionRate?: number | null
        isActive?: boolean
        sortOrder?: number
      },
      adminActor(req),
    )
    successRes(res, 'Category created.', category, 201)
  })

export const updateCategoryHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const category = await adminUpdateCategory(
      Number(req.params.id),
      req.body as { name?: string; description?: string; commissionRate?: number | null; isActive?: boolean; sortOrder?: number },
      adminActor(req),
    )
    successRes(res, 'Category updated.', category)
  })

export const deleteCategoryHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    await adminDeleteCategory(Number(req.params.id), adminActor(req))
    successRes(res, 'Category deleted.', {})
  })

// ─── Orders + payments ───────────────────────────────────────────────────────

export const listOrdersHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const result = await adminListOrders(req.query as unknown as AdminOrderListQuery)
    successRes(res, 'Orders retrieved.', result)
  })

export const getOrderHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const order = await adminGetOrder(String(req.params.reference))
    if (!order) throw new NotFoundError('Order not found.')
    successRes(res, 'Order retrieved.', order)
  })

export const updateOrderStatusHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const body = req.body as { status: string; reason?: string }
    const order = await adminUpdateOrderStatus(String(req.params.reference), body, adminActor(req))
    successRes(res, 'Order updated.', order)
  })

export const verifyOrderPaymentHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { note } = req.body as { note?: string }
    const order = await verifyOrderPayment(String(req.params.reference), req.admin!.id, note)
    successRes(res, 'Payment verified — commission ledger updated.', order)
  })

export const rejectOrderPaymentHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { reason } = req.body as { reason: string }
    const order = await rejectOrderPayment(String(req.params.reference), req.admin!.id, reason)
    successRes(res, 'Payment rejected.', order)
  })

export const createRefundHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const body = req.body as { reason: string; amount?: number; vendorId?: number }
    const refund = await adminCreateRefund(String(req.params.reference), body, adminActor(req))
    successRes(res, 'Refund request recorded. Resolve it to complete the refund.', refund, 201)
  })

export const resolveRefundHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const body = req.body as { action: 'APPROVED' | 'REJECTED'; resolution?: string }
    await adminResolveRefund(Number(req.params.id), body, adminActor(req))
    successRes(res, body.action === 'APPROVED' ? 'Refund completed.' : 'Refund rejected.', {})
  })

// ─── Settings + ledger + payouts ─────────────────────────────────────────────

export const getSettingsHandler = (_req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    successRes(res, 'Settings retrieved.', await adminGetMarketplaceSettings())
  })

export const updateSettingsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const settings = await adminUpdateMarketplaceSettings(
      req.body as Parameters<typeof adminUpdateMarketplaceSettings>[0],
      adminActor(req),
    )
    successRes(res, 'Settings updated.', settings)
  })

export const listLedgerHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const result = await adminListLedger(req.query as unknown as AdminLedgerQuery)
    successRes(res, 'Commission ledger retrieved.', result)
  })

export const listPayoutsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const query = req.query as { status?: string; vendorId?: string; page?: string; perPage?: string }
    const result = await adminListPayouts({
      status: query.status,
      vendorId: query.vendorId ? Number(query.vendorId) : undefined,
      page: Number(query.page ?? 1),
      perPage: Math.min(50, Number(query.perPage ?? 15)),
    })
    successRes(res, 'Payouts retrieved.', result)
  })

export const processPayoutHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const body = req.body as { action: 'APPROVED' | 'REJECTED' | 'PAID'; transactionRef?: string; note?: string }
    await adminProcessPayout(Number(req.params.id), body, adminActor(req))
    successRes(res, `Payout ${body.action.toLowerCase()}.`, {})
  })

// ─── Reviews ─────────────────────────────────────────────────────────────────

export const listReviewsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const query = req.query as { status?: string; search?: string; page?: string; perPage?: string }
    const result = await adminListProductReviews({
      status: query.status,
      search: query.search,
      page: Number(query.page ?? 1),
      perPage: Math.min(50, Number(query.perPage ?? 15)),
    })
    successRes(res, 'Reviews retrieved.', result)
  })

export const moderateReviewHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { action } = req.body as { action: 'APPROVED' | 'REJECTED' }
    await adminModerateProductReview(Number(req.params.id), action)
    successRes(res, action === 'APPROVED' ? 'Review approved.' : 'Review rejected.', {})
  })

// ─── Reports (CSV) ───────────────────────────────────────────────────────────

export const exportOrdersHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const query = req.query as { from?: string; to?: string; vendorId?: string }
    const csv = await adminExportOrdersCsv({
      from: query.from,
      to: query.to,
      vendorId: query.vendorId ? Number(query.vendorId) : undefined,
    })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="sawaba-shop-orders.csv"')
    res.send(`\uFEFF${csv}`)
  })

export const exportLedgerHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const query = req.query as { from?: string; to?: string; vendorId?: string }
    const csv = await adminExportLedgerCsv({
      from: query.from,
      to: query.to,
      vendorId: query.vendorId ? Number(query.vendorId) : undefined,
    })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="sawaba-commission-ledger.csv"')
    res.send(`\uFEFF${csv}`)
  })

export { serializeOrder }
