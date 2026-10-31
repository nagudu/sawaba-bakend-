import type { NextFunction, Request, Response } from 'express'
import { successRes } from '../utils/response'
import { uploadImageToCloudinary } from '../utils/upload'
import { UnprocessableError } from '../utils/errors'
import {
  changeVendorPassword,
  createVendorProduct,
  deleteVendorProduct,
  getVendorDashboard,
  getVendorEarnings,
  listVendorOrderItems,
  listVendorProducts,
  loginVendor,
  markVendorNotificationRead,
  registerVendor,
  requestVendorPayout,
  setVendorProductActive,
  updateVendorOrderItem,
  updateVendorProduct,
  updateVendorProfile,
  getVendorMe,
} from '../services/vendorService'
import type {
  VendorItemUpdateInput,
  VendorLoginInput,
  VendorProductInput,
  VendorPayoutRequestInput,
  VendorProfileUpdateInput,
  VendorRegisterInput,
} from '../validators/shop'

function handle(next: NextFunction, run: () => Promise<void>): void {
  run().catch(next)
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const vendorRegisterHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const result = await registerVendor(req.body as VendorRegisterInput)
    successRes(res, result.message, result.vendor, 201)
  })

export const vendorLoginHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const session = await loginVendor(req.body as VendorLoginInput)
    successRes(res, 'Welcome back!', session)
  })

export const vendorMeHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    successRes(res, 'Vendor profile retrieved.', await getVendorMe(req.vendor!.id))
  })

export const vendorUpdateProfileHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const vendor = await updateVendorProfile(req.vendor!.id, req.body as VendorProfileUpdateInput)
    successRes(res, 'Profile updated.', vendor)
  })

export const vendorChangePasswordHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    await changeVendorPassword(req.vendor!.id, req.body as { currentPassword: string; newPassword: string })
    successRes(res, 'Password changed.', {})
  })

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const vendorDashboardHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    successRes(res, 'Dashboard retrieved.', await getVendorDashboard(req.vendor!.id))
  })

export const vendorNotificationsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const dashboard = await getVendorDashboard(req.vendor!.id)
    successRes(res, 'Notifications retrieved.', dashboard.notifications)
  })

export const vendorReadNotificationHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    await markVendorNotificationRead(req.vendor!.id, Number(req.params.id))
    successRes(res, 'Notification marked as read.', {})
  })

// ─── Products ────────────────────────────────────────────────────────────────

export const vendorListProductsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const query = req.query as { status?: string; search?: string; page?: string; perPage?: string }
    const result = await listVendorProducts(req.vendor!.id, {
      page: Number(query.page ?? 1),
      perPage: Math.min(50, Number(query.perPage ?? 15)),
      status: query.status,
      search: query.search,
    })
    successRes(res, 'Products retrieved.', result)
  })

/**
 * Creates a product. Accepts multipart/form-data with:
 *   - product fields (JSON body or form fields)
 *   - `images` — up to 8 image files (first one is the cover)
 */
export const vendorCreateProductHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    if (files.length === 0) {
      throw new UnprocessableError('At least one product image is required.')
    }
    if (files.length > 8) {
      throw new UnprocessableError('A maximum of 8 product images is allowed.')
    }

    const uploaded: string[] = []
    for (const file of files) {
      const result = await uploadImageToCloudinary(file.buffer, 'sawaba-products', file.mimetype)
      uploaded.push(result.url)
    }

    // Form fields arrive as strings — parse the ones that are structured.
    const body = req.body as Record<string, string>
    const input: VendorProductInput = {
      name: String(body.name ?? ''),
      description: String(body.description ?? ''),
      brand: body.brand ?? '',
      categoryId: body.categoryId ? Number(body.categoryId) : null,
      price: Number(body.price ?? 0),
      compareAtPrice: body.compareAtPrice ? Number(body.compareAtPrice) : null,
      stock: Number(body.stock ?? 0),
      lowStockThreshold: body.lowStockThreshold ? Number(body.lowStockThreshold) : undefined,
      status: body.status === 'DRAFT' ? 'DRAFT' : 'PENDING_REVIEW',
      variations: body.variations
        ? (JSON.parse(body.variations) as VendorProductInput['variations'])
        : undefined,
    }

    if (!input.name || input.name.length < 3) {
      throw new UnprocessableError('Product name is required (min 3 characters).')
    }
    if (input.description.length < 10) {
      throw new UnprocessableError('Product description is required (min 10 characters).')
    }
    if (!Number.isFinite(input.price) || input.price < 1) {
      throw new UnprocessableError('A valid price is required.')
    }
    if (!Number.isFinite(input.stock) || input.stock < 0) {
      throw new UnprocessableError('A valid stock quantity is required.')
    }

    const product = await createVendorProduct(req.vendor!.id, req.vendor!, input, uploaded)
    successRes(res, 'Product created.', product, 201)
  })

export const vendorUpdateProductHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    const uploaded: string[] = []
    for (const file of files.slice(0, 8)) {
      const result = await uploadImageToCloudinary(file.buffer, 'sawaba-products', file.mimetype)
      uploaded.push(result.url)
    }

    const body = req.body as Record<string, string>
    const patch: Partial<VendorProductInput> = {}
    if (body.name !== undefined) patch.name = String(body.name)
    if (body.description !== undefined) patch.description = String(body.description)
    if (body.brand !== undefined) patch.brand = body.brand
    if (body.categoryId !== undefined) patch.categoryId = body.categoryId ? Number(body.categoryId) : null
    if (body.price !== undefined) patch.price = Number(body.price)
    if (body.compareAtPrice !== undefined) {
      patch.compareAtPrice = body.compareAtPrice ? Number(body.compareAtPrice) : null
    }
    if (body.stock !== undefined) patch.stock = Number(body.stock)
    if (body.lowStockThreshold !== undefined) patch.lowStockThreshold = Number(body.lowStockThreshold)
    if (body.variations !== undefined) {
      patch.variations = body.variations
        ? (JSON.parse(body.variations) as VendorProductInput['variations'])
        : []
    }

    const product = await updateVendorProduct(
      req.vendor!.id,
      req.vendor!,
      Number(req.params.id),
      patch,
      uploaded,
    )
    successRes(res, 'Product updated.', product)
  })

export const vendorToggleProductHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { isActive } = req.body as { isActive: boolean }
    const product = await setVendorProductActive(req.vendor!.id, Number(req.params.id), Boolean(isActive))
    successRes(res, isActive ? 'Product reactivated.' : 'Product paused.', product)
  })

export const vendorDeleteProductHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    await deleteVendorProduct(req.vendor!.id, Number(req.params.id))
    successRes(res, 'Product removed.', {})
  })

// ─── Orders ──────────────────────────────────────────────────────────────────

export const vendorListOrdersHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const query = req.query as { status?: string; search?: string; page?: string; perPage?: string }
    const result = await listVendorOrderItems(req.vendor!.id, {
      status: query.status,
      search: query.search,
      page: Number(query.page ?? 1),
      perPage: Math.min(50, Number(query.perPage ?? 15)),
    })
    successRes(res, 'Orders retrieved.', result)
  })

export const vendorUpdateOrderItemHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const input = req.body as VendorItemUpdateInput
    const item = await updateVendorOrderItem(req.vendor!.id, Number(req.params.itemId), input)
    successRes(res, 'Order item updated.', item)
  })

// ─── Earnings + payouts ──────────────────────────────────────────────────────

export const vendorEarningsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const query = req.query as { page?: string; perPage?: string; settlementStatus?: string }
    const result = await getVendorEarnings(req.vendor!.id, {
      page: Number(query.page ?? 1),
      perPage: Math.min(50, Number(query.perPage ?? 20)),
      settlementStatus: query.settlementStatus,
    })
    successRes(res, 'Earnings retrieved.', result)
  })

export const vendorRequestPayoutHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const input = req.body as VendorPayoutRequestInput
    const result = await requestVendorPayout(req.vendor!.id, input)
    successRes(res, result.message, {})
  })
