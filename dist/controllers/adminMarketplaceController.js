"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeOrder = exports.exportLedgerHandler = exports.exportOrdersHandler = exports.moderateReviewHandler = exports.listReviewsHandler = exports.processPayoutHandler = exports.listPayoutsHandler = exports.listLedgerHandler = exports.updateSettingsHandler = exports.getSettingsHandler = exports.resolveRefundHandler = exports.createRefundHandler = exports.rejectOrderPaymentHandler = exports.verifyOrderPaymentHandler = exports.updateOrderStatusHandler = exports.getOrderHandler = exports.listOrdersHandler = exports.deleteCategoryHandler = exports.updateCategoryHandler = exports.createCategoryHandler = exports.listCategoriesHandler = exports.deleteProductHandler = exports.moderateProductHandler = exports.setProductAvailabilityHandler = exports.updateProductHandler = exports.createProductHandler = exports.listProductsHandler = exports.updateVendorStatusHandler = exports.getVendorHandler = exports.listVendorsHandler = exports.overviewHandler = void 0;
const response_1 = require("../utils/response");
const errors_1 = require("../utils/errors");
const adminMarketplaceService_1 = require("../services/adminMarketplaceService");
const shopPaymentService_1 = require("../services/shopPaymentService");
const shopService_1 = require("../services/shopService");
Object.defineProperty(exports, "serializeOrder", { enumerable: true, get: function () { return shopService_1.serializeOrder; } });
const upload_1 = require("../utils/upload");
function handle(next, run) {
    run().catch(next);
}
function adminActor(req) {
    return { id: req.admin.id, name: req.admin.name };
}
// ─── Overview ────────────────────────────────────────────────────────────────
const overviewHandler = (_req, res, next) => handle(next, async () => {
    (0, response_1.successRes)(res, 'Marketplace overview retrieved.', await (0, adminMarketplaceService_1.adminGetOverview)());
});
exports.overviewHandler = overviewHandler;
// ─── Vendors ─────────────────────────────────────────────────────────────────
const listVendorsHandler = (req, res, next) => handle(next, async () => {
    const result = await (0, adminMarketplaceService_1.adminListVendors)(req.query);
    (0, response_1.successRes)(res, 'Vendors retrieved.', result);
});
exports.listVendorsHandler = listVendorsHandler;
const getVendorHandler = (req, res, next) => handle(next, async () => {
    (0, response_1.successRes)(res, 'Vendor retrieved.', await (0, adminMarketplaceService_1.adminGetVendor)(Number(req.params.id)));
});
exports.getVendorHandler = getVendorHandler;
const updateVendorStatusHandler = (req, res, next) => handle(next, async () => {
    const body = req.body;
    const vendor = await (0, adminMarketplaceService_1.adminUpdateVendorStatus)(Number(req.params.id), body, adminActor(req));
    (0, response_1.successRes)(res, `Vendor ${body.status.toLowerCase()}.`, vendor);
});
exports.updateVendorStatusHandler = updateVendorStatusHandler;
// ─── Products + categories ───────────────────────────────────────────────────
const listProductsHandler = (req, res, next) => handle(next, async () => {
    const result = await (0, adminMarketplaceService_1.adminListProducts)(req.query);
    (0, response_1.successRes)(res, 'Products retrieved.', result);
});
exports.listProductsHandler = listProductsHandler;
async function uploadProductImages(req) {
    const files = req.files ?? [];
    if (files.length > 8)
        throw new errors_1.UnprocessableError('A maximum of 8 product images is allowed.');
    const urls = [];
    for (const file of files) {
        const uploaded = await (0, upload_1.uploadImageToCloudinary)(file.buffer, 'sawaba-products', file.mimetype);
        urls.push(uploaded.url);
    }
    return urls;
}
const createProductHandler = (req, res, next) => handle(next, async () => {
    const product = await (0, adminMarketplaceService_1.adminCreateProduct)(req.body, await uploadProductImages(req), adminActor(req));
    (0, response_1.successRes)(res, 'Official-store product created.', product, 201);
});
exports.createProductHandler = createProductHandler;
const updateProductHandler = (req, res, next) => handle(next, async () => {
    const product = await (0, adminMarketplaceService_1.adminUpdateProduct)(Number(req.params.id), req.body, await uploadProductImages(req), adminActor(req));
    (0, response_1.successRes)(res, 'Product updated.', product);
});
exports.updateProductHandler = updateProductHandler;
const setProductAvailabilityHandler = (req, res, next) => handle(next, async () => {
    const { isActive } = req.body;
    await (0, adminMarketplaceService_1.adminSetProductAvailability)(Number(req.params.id), isActive, adminActor(req));
    (0, response_1.successRes)(res, `Product ${isActive ? 'made available' : 'made unavailable'}.`, {});
});
exports.setProductAvailabilityHandler = setProductAvailabilityHandler;
const moderateProductHandler = (req, res, next) => handle(next, async () => {
    const { action, reason } = req.body;
    await (0, adminMarketplaceService_1.adminModerateProduct)(Number(req.params.id), action, reason, adminActor(req));
    (0, response_1.successRes)(res, action === 'APPROVED' ? 'Product approved.' : 'Product rejected.', {});
});
exports.moderateProductHandler = moderateProductHandler;
const deleteProductHandler = (req, res, next) => handle(next, async () => {
    await (0, adminMarketplaceService_1.adminDeleteProduct)(Number(req.params.id), adminActor(req));
    (0, response_1.successRes)(res, 'Product deleted.', {});
});
exports.deleteProductHandler = deleteProductHandler;
const listCategoriesHandler = (req, res, next) => handle(next, async () => {
    const includeInactive = req.query.all === '1';
    const categories = await (0, adminMarketplaceService_1.adminListCategories)(includeInactive);
    (0, response_1.successRes)(res, 'Categories retrieved.', categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        commissionRate: category.commissionRate === null ? null : Number(category.commissionRate),
        isActive: category.isActive,
        sortOrder: category.sortOrder,
        productCount: category._count.products,
    })));
});
exports.listCategoriesHandler = listCategoriesHandler;
const createCategoryHandler = (req, res, next) => handle(next, async () => {
    const category = await (0, adminMarketplaceService_1.adminCreateCategory)(req.body, adminActor(req));
    (0, response_1.successRes)(res, 'Category created.', category, 201);
});
exports.createCategoryHandler = createCategoryHandler;
const updateCategoryHandler = (req, res, next) => handle(next, async () => {
    const category = await (0, adminMarketplaceService_1.adminUpdateCategory)(Number(req.params.id), req.body, adminActor(req));
    (0, response_1.successRes)(res, 'Category updated.', category);
});
exports.updateCategoryHandler = updateCategoryHandler;
const deleteCategoryHandler = (req, res, next) => handle(next, async () => {
    await (0, adminMarketplaceService_1.adminDeleteCategory)(Number(req.params.id), adminActor(req));
    (0, response_1.successRes)(res, 'Category deleted.', {});
});
exports.deleteCategoryHandler = deleteCategoryHandler;
// ─── Orders + payments ───────────────────────────────────────────────────────
const listOrdersHandler = (req, res, next) => handle(next, async () => {
    const result = await (0, adminMarketplaceService_1.adminListOrders)(req.query);
    (0, response_1.successRes)(res, 'Orders retrieved.', result);
});
exports.listOrdersHandler = listOrdersHandler;
const getOrderHandler = (req, res, next) => handle(next, async () => {
    const order = await (0, adminMarketplaceService_1.adminGetOrder)(String(req.params.reference));
    if (!order)
        throw new errors_1.NotFoundError('Order not found.');
    (0, response_1.successRes)(res, 'Order retrieved.', order);
});
exports.getOrderHandler = getOrderHandler;
const updateOrderStatusHandler = (req, res, next) => handle(next, async () => {
    const body = req.body;
    const order = await (0, adminMarketplaceService_1.adminUpdateOrderStatus)(String(req.params.reference), body, adminActor(req));
    (0, response_1.successRes)(res, 'Order updated.', order);
});
exports.updateOrderStatusHandler = updateOrderStatusHandler;
const verifyOrderPaymentHandler = (req, res, next) => handle(next, async () => {
    const { note } = req.body;
    const order = await (0, shopPaymentService_1.verifyOrderPayment)(String(req.params.reference), req.admin.id, note);
    (0, response_1.successRes)(res, 'Payment verified — commission ledger updated.', order);
});
exports.verifyOrderPaymentHandler = verifyOrderPaymentHandler;
const rejectOrderPaymentHandler = (req, res, next) => handle(next, async () => {
    const { reason } = req.body;
    const order = await (0, shopPaymentService_1.rejectOrderPayment)(String(req.params.reference), req.admin.id, reason);
    (0, response_1.successRes)(res, 'Payment rejected.', order);
});
exports.rejectOrderPaymentHandler = rejectOrderPaymentHandler;
const createRefundHandler = (req, res, next) => handle(next, async () => {
    const body = req.body;
    const refund = await (0, adminMarketplaceService_1.adminCreateRefund)(String(req.params.reference), body, adminActor(req));
    (0, response_1.successRes)(res, 'Refund request recorded. Resolve it to complete the refund.', refund, 201);
});
exports.createRefundHandler = createRefundHandler;
const resolveRefundHandler = (req, res, next) => handle(next, async () => {
    const body = req.body;
    await (0, adminMarketplaceService_1.adminResolveRefund)(Number(req.params.id), body, adminActor(req));
    (0, response_1.successRes)(res, body.action === 'APPROVED' ? 'Refund completed.' : 'Refund rejected.', {});
});
exports.resolveRefundHandler = resolveRefundHandler;
// ─── Settings + ledger + payouts ─────────────────────────────────────────────
const getSettingsHandler = (_req, res, next) => handle(next, async () => {
    (0, response_1.successRes)(res, 'Settings retrieved.', await (0, adminMarketplaceService_1.adminGetMarketplaceSettings)());
});
exports.getSettingsHandler = getSettingsHandler;
const updateSettingsHandler = (req, res, next) => handle(next, async () => {
    const settings = await (0, adminMarketplaceService_1.adminUpdateMarketplaceSettings)(req.body, adminActor(req));
    (0, response_1.successRes)(res, 'Settings updated.', settings);
});
exports.updateSettingsHandler = updateSettingsHandler;
const listLedgerHandler = (req, res, next) => handle(next, async () => {
    const result = await (0, adminMarketplaceService_1.adminListLedger)(req.query);
    (0, response_1.successRes)(res, 'Commission ledger retrieved.', result);
});
exports.listLedgerHandler = listLedgerHandler;
const listPayoutsHandler = (req, res, next) => handle(next, async () => {
    const query = req.query;
    const result = await (0, adminMarketplaceService_1.adminListPayouts)({
        status: query.status,
        vendorId: query.vendorId ? Number(query.vendorId) : undefined,
        page: Number(query.page ?? 1),
        perPage: Math.min(50, Number(query.perPage ?? 15)),
    });
    (0, response_1.successRes)(res, 'Payouts retrieved.', result);
});
exports.listPayoutsHandler = listPayoutsHandler;
const processPayoutHandler = (req, res, next) => handle(next, async () => {
    const body = req.body;
    await (0, adminMarketplaceService_1.adminProcessPayout)(Number(req.params.id), body, adminActor(req));
    (0, response_1.successRes)(res, `Payout ${body.action.toLowerCase()}.`, {});
});
exports.processPayoutHandler = processPayoutHandler;
// ─── Reviews ─────────────────────────────────────────────────────────────────
const listReviewsHandler = (req, res, next) => handle(next, async () => {
    const query = req.query;
    const result = await (0, adminMarketplaceService_1.adminListProductReviews)({
        status: query.status,
        search: query.search,
        page: Number(query.page ?? 1),
        perPage: Math.min(50, Number(query.perPage ?? 15)),
    });
    (0, response_1.successRes)(res, 'Reviews retrieved.', result);
});
exports.listReviewsHandler = listReviewsHandler;
const moderateReviewHandler = (req, res, next) => handle(next, async () => {
    const { action } = req.body;
    await (0, adminMarketplaceService_1.adminModerateProductReview)(Number(req.params.id), action);
    (0, response_1.successRes)(res, action === 'APPROVED' ? 'Review approved.' : 'Review rejected.', {});
});
exports.moderateReviewHandler = moderateReviewHandler;
// ─── Reports (CSV) ───────────────────────────────────────────────────────────
const exportOrdersHandler = (req, res, next) => handle(next, async () => {
    const query = req.query;
    const csv = await (0, adminMarketplaceService_1.adminExportOrdersCsv)({
        from: query.from,
        to: query.to,
        vendorId: query.vendorId ? Number(query.vendorId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sawaba-shop-orders.csv"');
    res.send(`\uFEFF${csv}`);
});
exports.exportOrdersHandler = exportOrdersHandler;
const exportLedgerHandler = (req, res, next) => handle(next, async () => {
    const query = req.query;
    const csv = await (0, adminMarketplaceService_1.adminExportLedgerCsv)({
        from: query.from,
        to: query.to,
        vendorId: query.vendorId ? Number(query.vendorId) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sawaba-commission-ledger.csv"');
    res.send(`\uFEFF${csv}`);
});
exports.exportLedgerHandler = exportLedgerHandler;
//# sourceMappingURL=adminMarketplaceController.js.map