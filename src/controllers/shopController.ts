import type { NextFunction, Request, Response } from 'express'
import { successRes } from '../utils/response'
import {
  addToCart,
  clearCart,
  createProductReview,
  createShopOrder,
  getCart,
  getOrderByReference,
  getShopProductBySlug,
  cancelShopOrder,
  listCustomerOrders,
  listProductReviews,
  listShopBrands,
  listShopCategories,
  listShopProducts,
  removeCartItem,
  submitOrderReceipt,
  submitOrderTransferReference,
  updateCartItem,
} from '../services/shopService'
import {
  initializeShopOrderPaystack,
  verifyShopOrderPaystack,
} from '../services/shopPaymentService'
import { getMarketplaceSettings } from '../services/marketplaceService'
import { uploadImageToCloudinary } from '../utils/upload'
import { UnprocessableError } from '../utils/errors'
import type {
  CartAddInput,
  CheckoutInput,
  ProductListQuery,
} from '../validators/shop'

function handle(next: NextFunction, run: () => Promise<void>): void {
  run().catch(next)
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const listProductsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const query = req.query as unknown as ProductListQuery
    const result = await listShopProducts(query)
    successRes(res, 'Products retrieved.', result)
  })

export const getProductHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const product = await getShopProductBySlug(String(req.params.slug))
    successRes(res, 'Product retrieved.', product)
  })

export const listCategoriesHandler = (_req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    successRes(res, 'Categories retrieved.', await listShopCategories())
  })

export const listBrandsHandler = (_req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    successRes(res, 'Brands retrieved.', await listShopBrands())
  })

export const getShopSettingsHandler = (_req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const settings = await getMarketplaceSettings()
    successRes(res, 'Shop settings retrieved.', {
      deliveryFee: Number(settings.deliveryFee),
      freeDeliveryThreshold: Number(settings.freeDeliveryThreshold),
      deliveryLocations: settings.deliveryLocations
        .split(',')
        .map((location) => location.trim())
        .filter(Boolean),
      allowGuestCheckout: settings.allowGuestCheckout,
      vendorRegistrationOpen: settings.vendorRegistrationOpen,
      requireProductApproval: settings.requireProductApproval,
    })
  })

// ─── Cart ────────────────────────────────────────────────────────────────────

export const getCartHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const token = String(req.query.token ?? '')
    const cart = await getCart(token, req.customer?.id ?? null)
    successRes(res, 'Cart retrieved.', cart)
  })

export const addToCartHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const input = req.body as CartAddInput
    const cart = await addToCart(input, req.customer?.id ?? null)
    successRes(res, 'Added to cart.', cart, 201)
  })

export const updateCartItemHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { token, quantity } = req.body as { token: string; quantity: number }
    const cart = await updateCartItem(Number(req.params.itemId), token, quantity)
    successRes(res, 'Cart updated.', cart)
  })

export const removeCartItemHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { token } = req.body as { token: string }
    const cart = await removeCartItem(Number(req.params.itemId), token)
    successRes(res, 'Item removed.', cart)
  })

export const clearCartHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { token } = req.body as { token: string }
    await clearCart(token)
    successRes(res, 'Cart cleared.', {})
  })

// ─── Checkout + orders ───────────────────────────────────────────────────────

export const createOrderHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const input = req.body as CheckoutInput
    const result = await createShopOrder(input, req.customer?.id ?? null)
    successRes(res, 'Order placed successfully.', result.order, 201)
  })

export const getOrderHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { reference, phone } = req.query as { reference: string; phone: string }
    const order = await getOrderByReference(reference, phone)
    successRes(res, 'Order retrieved.', order)
  })

export const cancelOrderHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { reference, phone } = req.body as { reference: string; phone: string }
    const order = await cancelShopOrder(reference, phone)
    successRes(res, 'Order cancelled.', order)
  })

export const submitReceiptHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const reference = String(req.body.reference)
    if (!req.file) {
      throw new UnprocessableError('Please attach your transfer receipt (screenshot or photo).')
    }
    const uploaded = await uploadImageToCloudinary(req.file.buffer, 'sawaba-shop-receipts', req.file.mimetype)
    const order = await submitOrderReceipt(
      reference,
      uploaded,
      req.body.transactionReference ? String(req.body.transactionReference) : undefined,
    )
    successRes(res, 'Receipt submitted — your payment is under review.', order)
  })

export const submitTransferReferenceHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { reference, transactionReference } = req.body as {
      reference: string
      transactionReference: string
    }
    const order = await submitOrderTransferReference(reference, transactionReference)
    successRes(res, 'Transfer reference recorded — your payment is under review.', order)
  })

export const initOrderPaystackHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const result = await initializeShopOrderPaystack(String(req.params.reference))
    successRes(res, 'Payment initialized.', result)
  })

export const verifyOrderPaystackHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const { reference } = req.body as { reference: string }
    const order = await verifyShopOrderPaystack(String(req.params.reference), reference)
    successRes(res, 'Payment verified.', order)
  })

export const listMyOrdersHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const page = Number(req.query.page ?? 1)
    const perPage = Math.min(50, Number(req.query.perPage ?? 15))
    const result = await listCustomerOrders(req.customer!.id, page, perPage)
    successRes(res, 'Orders retrieved.', result)
  })

// ─── Reviews ─────────────────────────────────────────────────────────────────

export const listReviewsHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const page = Number(req.query.page ?? 1)
    const perPage = Math.min(50, Number(req.query.perPage ?? 10))
    const result = await listProductReviews(Number(req.params.id), page, perPage)
    successRes(res, 'Reviews retrieved.', result)
  })

export const createReviewHandler = (req: Request, res: Response, next: NextFunction) =>
  handle(next, async () => {
    const result = await createProductReview(
      Number(req.params.id),
      req.body as { rating: number; comment: string; customerName?: string },
      {
        customerId: req.customer?.id,
        phone: req.customer?.phone,
        email: req.customer?.email ?? undefined,
      },
    )
    successRes(res, result.message, {}, 201)
  })
