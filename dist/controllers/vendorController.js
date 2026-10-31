"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vendorRequestPayoutHandler = exports.vendorEarningsHandler = exports.vendorUpdateOrderItemHandler = exports.vendorListOrdersHandler = exports.vendorDeleteProductHandler = exports.vendorToggleProductHandler = exports.vendorUpdateProductHandler = exports.vendorCreateProductHandler = exports.vendorListProductsHandler = exports.vendorReadNotificationHandler = exports.vendorNotificationsHandler = exports.vendorDashboardHandler = exports.vendorChangePasswordHandler = exports.vendorUpdateProfileHandler = exports.vendorMeHandler = exports.vendorLoginHandler = exports.vendorRegisterHandler = void 0;
const response_1 = require("../utils/response");
const upload_1 = require("../utils/upload");
const errors_1 = require("../utils/errors");
const vendorService_1 = require("../services/vendorService");
function handle(next, run) {
    run().catch(next);
}
// ─── Auth ────────────────────────────────────────────────────────────────────
const vendorRegisterHandler = (req, res, next) => handle(next, async () => {
    const result = await (0, vendorService_1.registerVendor)(req.body);
    (0, response_1.successRes)(res, result.message, result.vendor, 201);
});
exports.vendorRegisterHandler = vendorRegisterHandler;
const vendorLoginHandler = (req, res, next) => handle(next, async () => {
    const session = await (0, vendorService_1.loginVendor)(req.body);
    (0, response_1.successRes)(res, 'Welcome back!', session);
});
exports.vendorLoginHandler = vendorLoginHandler;
const vendorMeHandler = (req, res, next) => handle(next, async () => {
    (0, response_1.successRes)(res, 'Vendor profile retrieved.', await (0, vendorService_1.getVendorMe)(req.vendor.id));
});
exports.vendorMeHandler = vendorMeHandler;
const vendorUpdateProfileHandler = (req, res, next) => handle(next, async () => {
    const vendor = await (0, vendorService_1.updateVendorProfile)(req.vendor.id, req.body);
    (0, response_1.successRes)(res, 'Profile updated.', vendor);
});
exports.vendorUpdateProfileHandler = vendorUpdateProfileHandler;
const vendorChangePasswordHandler = (req, res, next) => handle(next, async () => {
    await (0, vendorService_1.changeVendorPassword)(req.vendor.id, req.body);
    (0, response_1.successRes)(res, 'Password changed.', {});
});
exports.vendorChangePasswordHandler = vendorChangePasswordHandler;
// ─── Dashboard ───────────────────────────────────────────────────────────────
const vendorDashboardHandler = (req, res, next) => handle(next, async () => {
    (0, response_1.successRes)(res, 'Dashboard retrieved.', await (0, vendorService_1.getVendorDashboard)(req.vendor.id));
});
exports.vendorDashboardHandler = vendorDashboardHandler;
const vendorNotificationsHandler = (req, res, next) => handle(next, async () => {
    const dashboard = await (0, vendorService_1.getVendorDashboard)(req.vendor.id);
    (0, response_1.successRes)(res, 'Notifications retrieved.', dashboard.notifications);
});
exports.vendorNotificationsHandler = vendorNotificationsHandler;
const vendorReadNotificationHandler = (req, res, next) => handle(next, async () => {
    await (0, vendorService_1.markVendorNotificationRead)(req.vendor.id, Number(req.params.id));
    (0, response_1.successRes)(res, 'Notification marked as read.', {});
});
exports.vendorReadNotificationHandler = vendorReadNotificationHandler;
// ─── Products ────────────────────────────────────────────────────────────────
const vendorListProductsHandler = (req, res, next) => handle(next, async () => {
    const query = req.query;
    const result = await (0, vendorService_1.listVendorProducts)(req.vendor.id, {
        page: Number(query.page ?? 1),
        perPage: Math.min(50, Number(query.perPage ?? 15)),
        status: query.status,
        search: query.search,
    });
    (0, response_1.successRes)(res, 'Products retrieved.', result);
});
exports.vendorListProductsHandler = vendorListProductsHandler;
/**
 * Creates a product. Accepts multipart/form-data with:
 *   - product fields (JSON body or form fields)
 *   - `images` — up to 8 image files (first one is the cover)
 */
const vendorCreateProductHandler = (req, res, next) => handle(next, async () => {
    const files = req.files ?? [];
    if (files.length === 0) {
        throw new errors_1.UnprocessableError('At least one product image is required.');
    }
    if (files.length > 8) {
        throw new errors_1.UnprocessableError('A maximum of 8 product images is allowed.');
    }
    const uploaded = [];
    for (const file of files) {
        const result = await (0, upload_1.uploadImageToCloudinary)(file.buffer, 'sawaba-products', file.mimetype);
        uploaded.push(result.url);
    }
    // Form fields arrive as strings — parse the ones that are structured.
    const body = req.body;
    const input = {
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
            ? JSON.parse(body.variations)
            : undefined,
    };
    if (!input.name || input.name.length < 3) {
        throw new errors_1.UnprocessableError('Product name is required (min 3 characters).');
    }
    if (input.description.length < 10) {
        throw new errors_1.UnprocessableError('Product description is required (min 10 characters).');
    }
    if (!Number.isFinite(input.price) || input.price < 1) {
        throw new errors_1.UnprocessableError('A valid price is required.');
    }
    if (!Number.isFinite(input.stock) || input.stock < 0) {
        throw new errors_1.UnprocessableError('A valid stock quantity is required.');
    }
    const product = await (0, vendorService_1.createVendorProduct)(req.vendor.id, req.vendor, input, uploaded);
    (0, response_1.successRes)(res, 'Product created.', product, 201);
});
exports.vendorCreateProductHandler = vendorCreateProductHandler;
const vendorUpdateProductHandler = (req, res, next) => handle(next, async () => {
    const files = req.files ?? [];
    const uploaded = [];
    for (const file of files.slice(0, 8)) {
        const result = await (0, upload_1.uploadImageToCloudinary)(file.buffer, 'sawaba-products', file.mimetype);
        uploaded.push(result.url);
    }
    const body = req.body;
    const patch = {};
    if (body.name !== undefined)
        patch.name = String(body.name);
    if (body.description !== undefined)
        patch.description = String(body.description);
    if (body.brand !== undefined)
        patch.brand = body.brand;
    if (body.categoryId !== undefined)
        patch.categoryId = body.categoryId ? Number(body.categoryId) : null;
    if (body.price !== undefined)
        patch.price = Number(body.price);
    if (body.compareAtPrice !== undefined) {
        patch.compareAtPrice = body.compareAtPrice ? Number(body.compareAtPrice) : null;
    }
    if (body.stock !== undefined)
        patch.stock = Number(body.stock);
    if (body.lowStockThreshold !== undefined)
        patch.lowStockThreshold = Number(body.lowStockThreshold);
    if (body.variations !== undefined) {
        patch.variations = body.variations
            ? JSON.parse(body.variations)
            : [];
    }
    const product = await (0, vendorService_1.updateVendorProduct)(req.vendor.id, req.vendor, Number(req.params.id), patch, uploaded);
    (0, response_1.successRes)(res, 'Product updated.', product);
});
exports.vendorUpdateProductHandler = vendorUpdateProductHandler;
const vendorToggleProductHandler = (req, res, next) => handle(next, async () => {
    const { isActive } = req.body;
    const product = await (0, vendorService_1.setVendorProductActive)(req.vendor.id, Number(req.params.id), Boolean(isActive));
    (0, response_1.successRes)(res, isActive ? 'Product reactivated.' : 'Product paused.', product);
});
exports.vendorToggleProductHandler = vendorToggleProductHandler;
const vendorDeleteProductHandler = (req, res, next) => handle(next, async () => {
    await (0, vendorService_1.deleteVendorProduct)(req.vendor.id, Number(req.params.id));
    (0, response_1.successRes)(res, 'Product removed.', {});
});
exports.vendorDeleteProductHandler = vendorDeleteProductHandler;
// ─── Orders ──────────────────────────────────────────────────────────────────
const vendorListOrdersHandler = (req, res, next) => handle(next, async () => {
    const query = req.query;
    const result = await (0, vendorService_1.listVendorOrderItems)(req.vendor.id, {
        status: query.status,
        search: query.search,
        page: Number(query.page ?? 1),
        perPage: Math.min(50, Number(query.perPage ?? 15)),
    });
    (0, response_1.successRes)(res, 'Orders retrieved.', result);
});
exports.vendorListOrdersHandler = vendorListOrdersHandler;
const vendorUpdateOrderItemHandler = (req, res, next) => handle(next, async () => {
    const input = req.body;
    const item = await (0, vendorService_1.updateVendorOrderItem)(req.vendor.id, Number(req.params.itemId), input);
    (0, response_1.successRes)(res, 'Order item updated.', item);
});
exports.vendorUpdateOrderItemHandler = vendorUpdateOrderItemHandler;
// ─── Earnings + payouts ──────────────────────────────────────────────────────
const vendorEarningsHandler = (req, res, next) => handle(next, async () => {
    const query = req.query;
    const result = await (0, vendorService_1.getVendorEarnings)(req.vendor.id, {
        page: Number(query.page ?? 1),
        perPage: Math.min(50, Number(query.perPage ?? 20)),
        settlementStatus: query.settlementStatus,
    });
    (0, response_1.successRes)(res, 'Earnings retrieved.', result);
});
exports.vendorEarningsHandler = vendorEarningsHandler;
const vendorRequestPayoutHandler = (req, res, next) => handle(next, async () => {
    const input = req.body;
    const result = await (0, vendorService_1.requestVendorPayout)(req.vendor.id, input);
    (0, response_1.successRes)(res, result.message, {});
});
exports.vendorRequestPayoutHandler = vendorRequestPayoutHandler;
//# sourceMappingURL=vendorController.js.map