"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReviewHandler = exports.listReviewsHandler = exports.listMyOrdersHandler = exports.verifyOrderPaystackHandler = exports.initOrderPaystackHandler = exports.submitTransferReferenceHandler = exports.submitReceiptHandler = exports.cancelOrderHandler = exports.getOrderHandler = exports.createOrderHandler = exports.clearCartHandler = exports.removeCartItemHandler = exports.updateCartItemHandler = exports.addToCartHandler = exports.getCartHandler = exports.getShopSettingsHandler = exports.listBrandsHandler = exports.listCategoriesHandler = exports.getProductHandler = exports.listProductsHandler = void 0;
const response_1 = require("../utils/response");
const shopService_1 = require("../services/shopService");
const shopPaymentService_1 = require("../services/shopPaymentService");
const marketplaceService_1 = require("../services/marketplaceService");
const upload_1 = require("../utils/upload");
const errors_1 = require("../utils/errors");
function handle(next, run) {
    run().catch(next);
}
// ─── Catalog ─────────────────────────────────────────────────────────────────
const listProductsHandler = (req, res, next) => handle(next, async () => {
    const query = req.query;
    const result = await (0, shopService_1.listShopProducts)(query);
    (0, response_1.successRes)(res, 'Products retrieved.', result);
});
exports.listProductsHandler = listProductsHandler;
const getProductHandler = (req, res, next) => handle(next, async () => {
    const product = await (0, shopService_1.getShopProductBySlug)(String(req.params.slug));
    (0, response_1.successRes)(res, 'Product retrieved.', product);
});
exports.getProductHandler = getProductHandler;
const listCategoriesHandler = (_req, res, next) => handle(next, async () => {
    (0, response_1.successRes)(res, 'Categories retrieved.', await (0, shopService_1.listShopCategories)());
});
exports.listCategoriesHandler = listCategoriesHandler;
const listBrandsHandler = (_req, res, next) => handle(next, async () => {
    (0, response_1.successRes)(res, 'Brands retrieved.', await (0, shopService_1.listShopBrands)());
});
exports.listBrandsHandler = listBrandsHandler;
const getShopSettingsHandler = (_req, res, next) => handle(next, async () => {
    const settings = await (0, marketplaceService_1.getMarketplaceSettings)();
    (0, response_1.successRes)(res, 'Shop settings retrieved.', {
        deliveryFee: Number(settings.deliveryFee),
        freeDeliveryThreshold: Number(settings.freeDeliveryThreshold),
        deliveryLocations: settings.deliveryLocations
            .split(',')
            .map((location) => location.trim())
            .filter(Boolean),
        allowGuestCheckout: settings.allowGuestCheckout,
        vendorRegistrationOpen: settings.vendorRegistrationOpen,
        requireProductApproval: settings.requireProductApproval,
    });
});
exports.getShopSettingsHandler = getShopSettingsHandler;
// ─── Cart ────────────────────────────────────────────────────────────────────
const getCartHandler = (req, res, next) => handle(next, async () => {
    const token = String(req.query.token ?? '');
    const cart = await (0, shopService_1.getCart)(token, req.customer?.id ?? null);
    (0, response_1.successRes)(res, 'Cart retrieved.', cart);
});
exports.getCartHandler = getCartHandler;
const addToCartHandler = (req, res, next) => handle(next, async () => {
    const input = req.body;
    const cart = await (0, shopService_1.addToCart)(input, req.customer?.id ?? null);
    (0, response_1.successRes)(res, 'Added to cart.', cart, 201);
});
exports.addToCartHandler = addToCartHandler;
const updateCartItemHandler = (req, res, next) => handle(next, async () => {
    const { token, quantity } = req.body;
    const cart = await (0, shopService_1.updateCartItem)(Number(req.params.itemId), token, quantity);
    (0, response_1.successRes)(res, 'Cart updated.', cart);
});
exports.updateCartItemHandler = updateCartItemHandler;
const removeCartItemHandler = (req, res, next) => handle(next, async () => {
    const { token } = req.body;
    const cart = await (0, shopService_1.removeCartItem)(Number(req.params.itemId), token);
    (0, response_1.successRes)(res, 'Item removed.', cart);
});
exports.removeCartItemHandler = removeCartItemHandler;
const clearCartHandler = (req, res, next) => handle(next, async () => {
    const { token } = req.body;
    await (0, shopService_1.clearCart)(token);
    (0, response_1.successRes)(res, 'Cart cleared.', {});
});
exports.clearCartHandler = clearCartHandler;
// ─── Checkout + orders ───────────────────────────────────────────────────────
const createOrderHandler = (req, res, next) => handle(next, async () => {
    const input = req.body;
    const result = await (0, shopService_1.createShopOrder)(input, req.customer?.id ?? null);
    (0, response_1.successRes)(res, 'Order placed successfully.', result.order, 201);
});
exports.createOrderHandler = createOrderHandler;
const getOrderHandler = (req, res, next) => handle(next, async () => {
    const { reference, phone } = req.query;
    const order = await (0, shopService_1.getOrderByReference)(reference, phone);
    (0, response_1.successRes)(res, 'Order retrieved.', order);
});
exports.getOrderHandler = getOrderHandler;
const cancelOrderHandler = (req, res, next) => handle(next, async () => {
    const { reference, phone } = req.body;
    const order = await (0, shopService_1.cancelShopOrder)(reference, phone);
    (0, response_1.successRes)(res, 'Order cancelled.', order);
});
exports.cancelOrderHandler = cancelOrderHandler;
const submitReceiptHandler = (req, res, next) => handle(next, async () => {
    const reference = String(req.body.reference);
    if (!req.file) {
        throw new errors_1.UnprocessableError('Please attach your transfer receipt (screenshot or photo).');
    }
    const uploaded = await (0, upload_1.uploadImageToCloudinary)(req.file.buffer, 'sawaba-shop-receipts', req.file.mimetype);
    const order = await (0, shopService_1.submitOrderReceipt)(reference, uploaded, req.body.transactionReference ? String(req.body.transactionReference) : undefined);
    (0, response_1.successRes)(res, 'Receipt submitted — your payment is under review.', order);
});
exports.submitReceiptHandler = submitReceiptHandler;
const submitTransferReferenceHandler = (req, res, next) => handle(next, async () => {
    const { reference, transactionReference } = req.body;
    const order = await (0, shopService_1.submitOrderTransferReference)(reference, transactionReference);
    (0, response_1.successRes)(res, 'Transfer reference recorded — your payment is under review.', order);
});
exports.submitTransferReferenceHandler = submitTransferReferenceHandler;
const initOrderPaystackHandler = (req, res, next) => handle(next, async () => {
    const result = await (0, shopPaymentService_1.initializeShopOrderPaystack)(String(req.params.reference));
    (0, response_1.successRes)(res, 'Payment initialized.', result);
});
exports.initOrderPaystackHandler = initOrderPaystackHandler;
const verifyOrderPaystackHandler = (req, res, next) => handle(next, async () => {
    const { reference } = req.body;
    const order = await (0, shopPaymentService_1.verifyShopOrderPaystack)(String(req.params.reference), reference);
    (0, response_1.successRes)(res, 'Payment verified.', order);
});
exports.verifyOrderPaystackHandler = verifyOrderPaystackHandler;
const listMyOrdersHandler = (req, res, next) => handle(next, async () => {
    const page = Number(req.query.page ?? 1);
    const perPage = Math.min(50, Number(req.query.perPage ?? 15));
    const result = await (0, shopService_1.listCustomerOrders)(req.customer.id, page, perPage);
    (0, response_1.successRes)(res, 'Orders retrieved.', result);
});
exports.listMyOrdersHandler = listMyOrdersHandler;
// ─── Reviews ─────────────────────────────────────────────────────────────────
const listReviewsHandler = (req, res, next) => handle(next, async () => {
    const page = Number(req.query.page ?? 1);
    const perPage = Math.min(50, Number(req.query.perPage ?? 10));
    const result = await (0, shopService_1.listProductReviews)(Number(req.params.id), page, perPage);
    (0, response_1.successRes)(res, 'Reviews retrieved.', result);
});
exports.listReviewsHandler = listReviewsHandler;
const createReviewHandler = (req, res, next) => handle(next, async () => {
    const result = await (0, shopService_1.createProductReview)(Number(req.params.id), req.body, {
        customerId: req.customer?.id,
        phone: req.customer?.phone,
        email: req.customer?.email ?? undefined,
    });
    (0, response_1.successRes)(res, result.message, {}, 201);
});
exports.createReviewHandler = createReviewHandler;
//# sourceMappingURL=shopController.js.map