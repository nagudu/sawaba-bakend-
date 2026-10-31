"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markOrderPaid = void 0;
exports.serializeVendor = serializeVendor;
exports.registerVendor = registerVendor;
exports.loginVendor = loginVendor;
exports.getVendorMe = getVendorMe;
exports.updateVendorProfile = updateVendorProfile;
exports.changeVendorPassword = changeVendorPassword;
exports.getVendorDashboard = getVendorDashboard;
exports.markVendorNotificationRead = markVendorNotificationRead;
exports.serializeVendorProduct = serializeVendorProduct;
exports.listVendorProducts = listVendorProducts;
exports.createVendorProduct = createVendorProduct;
exports.updateVendorProduct = updateVendorProduct;
exports.setVendorProductActive = setVendorProductActive;
exports.deleteVendorProduct = deleteVendorProduct;
exports.listVendorOrderItems = listVendorOrderItems;
exports.updateVendorOrderItem = updateVendorOrderItem;
exports.handleLineRefund = handleLineRefund;
exports.releaseMaturedEarnings = releaseMaturedEarnings;
exports.getVendorEarnings = getVendorEarnings;
exports.requestVendorPayout = requestVendorPayout;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const marketplaceService_1 = require("./marketplaceService");
const shopService_1 = require("./shopService");
const shopPaymentService_1 = require("./shopPaymentService");
Object.defineProperty(exports, "markOrderPaid", { enumerable: true, get: function () { return shopPaymentService_1.markOrderPaid; } });
/**
 * Vendor portal — registration/approval, products, orders, earnings, payouts.
 *
 * DATA ISOLATION: every query in this file is keyed by `vendorId` from the
 * verified JWT — never from client input. A vendor token can only ever reach
 * its own rows, enforced here on the backend.
 */
const round2 = (value) => Math.round(value * 100) / 100;
function slugify(value) {
    return (value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 140) || 'item');
}
async function uniqueVendorSlug(base) {
    const root = slugify(base);
    let candidate = root;
    for (let attempt = 0; attempt < 25; attempt += 1) {
        const existing = await database_1.prisma.vendor.findUnique({ where: { slug: candidate } });
        if (!existing)
            return candidate;
        candidate = `${root}-${Math.floor(Math.random() * 900 + 100)}`;
    }
    return `${root}-${Date.now().toString(36)}`;
}
async function uniqueProductSlug(base) {
    const root = slugify(base).slice(0, 210);
    let candidate = root;
    for (let attempt = 0; attempt < 25; attempt += 1) {
        const existing = await database_1.prisma.product.findUnique({ where: { slug: candidate } });
        if (!existing)
            return candidate;
        candidate = `${root}-${Math.floor(Math.random() * 900 + 100)}`;
    }
    return `${root}-${Date.now().toString(36)}`;
}
function serializeVendor(vendor, includePrivate = false) {
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
    };
}
function signVendorToken(vendor) {
    return jsonwebtoken_1.default.sign({ sub: vendor.id, email: vendor.email, name: vendor.businessName, role: 'VENDOR' }, env_1.env.jwtSecret, { expiresIn: env_1.env.jwtExpiresIn });
}
/** Public self-registration. New vendors always start PENDING admin approval. */
async function registerVendor(input) {
    await (0, marketplaceService_1.requireVendorRegistrationOpen)();
    const email = input.email.toLowerCase();
    const existing = await database_1.prisma.vendor.findFirst({ where: { email } });
    if (existing) {
        throw new errors_1.ConflictError('A vendor account with this email already exists. Please sign in instead.');
    }
    const passwordHash = await bcryptjs_1.default.hash(input.password, 12);
    const slug = await uniqueVendorSlug(input.businessName);
    const vendor = await database_1.prisma.$transaction(async (tx) => {
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
        });
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
        });
        return application;
    });
    return {
        message: 'Application received! Your vendor account is pending admin approval. You can sign in to complete your profile while you wait.',
        vendor: serializeVendor(vendor),
    };
}
async function loginVendor(input) {
    const identifier = input.identifier.trim().toLowerCase();
    const byEmail = identifier.includes('@');
    const vendor = await database_1.prisma.vendor.findFirst({
        where: byEmail ? { email: identifier } : { phone: identifier },
    });
    if (!vendor || !vendor.passwordHash) {
        throw new errors_1.UnauthorizedError('Invalid login details.');
    }
    if (!vendor.isActive) {
        throw new errors_1.UnauthorizedError('This vendor account has been deactivated.');
    }
    const matches = await bcryptjs_1.default.compare(input.password, vendor.passwordHash);
    if (!matches) {
        throw new errors_1.UnauthorizedError('Invalid login details.');
    }
    await database_1.prisma.vendor.update({
        where: { id: vendor.id },
        data: { lastLoginAt: new Date() },
    });
    return { token: signVendorToken(vendor), vendor: serializeVendor(vendor, true) };
}
async function getVendorMe(vendorId) {
    const vendor = await database_1.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor)
        throw new errors_1.UnauthorizedError('Vendor account no longer exists.');
    return serializeVendor(vendor, true);
}
async function updateVendorProfile(vendorId, input) {
    const vendor = await database_1.prisma.vendor.update({
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
    });
    return serializeVendor(vendor, true);
}
async function changeVendorPassword(vendorId, input) {
    const vendor = await database_1.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || !vendor.passwordHash)
        throw new errors_1.UnauthorizedError('Vendor account no longer exists.');
    const matches = await bcryptjs_1.default.compare(input.currentPassword, vendor.passwordHash);
    if (!matches)
        throw new errors_1.UnprocessableError('Current password is incorrect.');
    const passwordHash = await bcryptjs_1.default.hash(input.newPassword, 12);
    await database_1.prisma.vendor.update({ where: { id: vendorId }, data: { passwordHash } });
}
async function getVendorDashboard(vendorId) {
    const [productCounts, itemGroups, ledgerAgg, recentItems, notifications] = await Promise.all([
        database_1.prisma.product.groupBy({
            by: ['status'],
            where: { vendorId },
            _count: { _all: true },
        }),
        database_1.prisma.shopOrderItem.groupBy({
            by: ['status'],
            where: { vendorId },
            _count: { _all: true },
        }),
        database_1.prisma.commissionLedger.groupBy({
            by: ['settlementStatus'],
            where: { vendorId },
            _sum: { vendorNet: true, commissionAmount: true },
        }),
        database_1.prisma.shopOrderItem.findMany({
            where: { vendorId },
            include: { order: { select: { referenceCode: true, customerName: true, createdAt: true } } },
            orderBy: { createdAt: 'desc' },
            take: 8,
        }),
        database_1.prisma.vendorNotification.findMany({
            where: { vendorId },
            orderBy: { createdAt: 'desc' },
            take: 8,
        }),
    ]);
    const totalProducts = productCounts.reduce((sum, row) => sum + row._count._all, 0);
    const outOfStock = await database_1.prisma.product.count({ where: { vendorId, stock: 0, status: 'ACTIVE' } });
    const statusCount = (rows, status) => rows.find((row) => row.status === status)?._count._all ?? 0;
    const sumFor = (status) => Number(ledgerAgg.find((row) => row.settlementStatus === status)?._sum.vendorNet ?? 0);
    return {
        products: {
            total: totalProducts,
            active: statusCount(productCounts, 'ACTIVE'),
            outOfStock,
            pendingReview: statusCount(productCounts, 'PENDING_REVIEW'),
        },
        orders: {
            new: statusCount(itemGroups, 'PENDING') + statusCount(itemGroups, 'CONFIRMED'),
            processing: statusCount(itemGroups, 'PREPARING'),
            completed: statusCount(itemGroups, 'DELIVERED'),
            cancelled: statusCount(itemGroups, 'CANCELLED'),
            returned: statusCount(itemGroups, 'RETURNED'),
        },
        earnings: {
            totalSales: round2(ledgerAgg.reduce((sum, row) => sum +
                (row.settlementStatus === 'REVERSED' ? 0 : Number(row._sum.vendorNet ?? 0) + Number(row._sum.commissionAmount ?? 0)), 0)),
            totalCommission: round2(ledgerAgg.reduce((sum, row) => sum + (row.settlementStatus === 'REVERSED' ? 0 : Number(row._sum.commissionAmount ?? 0)), 0)),
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
    };
}
async function markVendorNotificationRead(vendorId, notificationId) {
    await database_1.prisma.vendorNotification.updateMany({
        where: { id: notificationId, vendorId, readAt: null },
        data: { readAt: new Date() },
    });
}
// ─── Product management ──────────────────────────────────────────────────────
function assertVendorSellable(vendor) {
    if (!vendor.isActive || vendor.status !== 'APPROVED') {
        throw new errors_1.ForbiddenError(vendor.status === 'PENDING'
            ? 'Your vendor application is still pending approval. Products can be listed once approved.'
            : !vendor.isActive
                ? 'Your vendor account is deactivated. You cannot manage products right now.'
                : `Your vendor account is ${vendor.status.toLowerCase()}. You cannot manage products right now.`);
    }
}
const vendorProductInclude = {
    category: { select: { id: true, name: true } },
    images: { orderBy: { sortOrder: 'asc' } },
    variations: true,
};
function serializeVendorProduct(product) {
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
    };
}
async function listVendorProducts(vendorId, query) {
    const { offset, limit } = (0, response_1.getPagination)(query);
    const where = {
        vendorId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
            ? { name: { contains: query.search } }
            : {}),
    };
    const [rows, total] = await Promise.all([
        database_1.prisma.product.findMany({
            where,
            include: vendorProductInclude,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
        }),
        database_1.prisma.product.count({ where }),
    ]);
    return { items: rows.map(serializeVendorProduct), total, page: query.page, perPage: query.perPage };
}
async function createVendorProduct(vendorId, vendor, input, imageUrls = []) {
    assertVendorSellable(vendor);
    const settings = await (0, marketplaceService_1.getMarketplaceSettings)();
    if (input.categoryId) {
        const category = await database_1.prisma.productCategory.findFirst({
            where: { id: input.categoryId, isActive: true },
        });
        if (!category)
            throw new errors_1.UnprocessableError('Selected category is unavailable.');
    }
    // Parse the optional JSON image list (URLs already uploaded by the frontend).
    let images = imageUrls.filter(Boolean);
    if (!images.length && input.imagesJson) {
        try {
            const parsed = JSON.parse(input.imagesJson);
            if (Array.isArray(parsed)) {
                images = parsed.filter((url) => typeof url === 'string' && url.length <= 500);
            }
        }
        catch {
            throw new errors_1.UnprocessableError('Invalid image list.');
        }
    }
    if (images.length === 0) {
        throw new errors_1.UnprocessableError('At least one product image is required.');
    }
    if (images.length > 8) {
        throw new errors_1.UnprocessableError('A maximum of 8 product images is allowed.');
    }
    const status = settings.requireProductApproval
        ? (input.status === 'DRAFT' ? 'DRAFT' : 'PENDING_REVIEW')
        : 'ACTIVE';
    const product = await database_1.prisma.product.create({
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
    });
    if (input.stock > 0) {
        await database_1.prisma.stockMovement.create({
            data: {
                productId: product.id,
                vendorId,
                change: input.stock,
                reason: 'RESTOCK',
                note: 'Initial stock',
                actorRole: 'VENDOR',
                actorId: vendorId,
            },
        });
    }
    return serializeVendorProduct(product);
}
async function updateVendorProduct(vendorId, vendor, productId, input, newImageUrls = []) {
    assertVendorSellable(vendor);
    const product = await database_1.prisma.product.findFirst({
        where: { id: productId, vendorId },
        include: vendorProductInclude,
    });
    if (!product)
        throw new errors_1.NotFoundError('Product not found.');
    if (input.categoryId) {
        const category = await database_1.prisma.productCategory.findFirst({
            where: { id: input.categoryId, isActive: true },
        });
        if (!category)
            throw new errors_1.UnprocessableError('Selected category is unavailable.');
    }
    let stockDelta = null;
    if (input.stock !== undefined && input.stock !== product.stock) {
        stockDelta = input.stock - product.stock;
    }
    const updates = {};
    if (input.name !== undefined)
        updates.name = input.name;
    if (input.description !== undefined)
        updates.description = input.description;
    if (input.brand !== undefined)
        updates.brand = input.brand.trim() || null;
    if (input.categoryId !== undefined) {
        updates.category = input.categoryId
            ? { connect: { id: input.categoryId } }
            : { disconnect: true };
    }
    if (input.price !== undefined)
        updates.price = input.price;
    if (input.compareAtPrice !== undefined) {
        updates.compareAtPrice = input.compareAtPrice ? Number(input.compareAtPrice) : null;
    }
    if (input.stock !== undefined)
        updates.stock = input.stock;
    if (input.lowStockThreshold !== undefined)
        updates.lowStockThreshold = input.lowStockThreshold;
    // Editing an ACTIVE product that was rejected/reviewed → back to review when
    // the marketplace requires approval (prevents unreviewed edits going live).
    const settings = await (0, marketplaceService_1.getMarketplaceSettings)();
    if (settings.requireProductApproval &&
        product.status === 'ACTIVE' &&
        (input.name !== undefined || input.description !== undefined || input.price !== undefined)) {
        updates.status = 'PENDING_REVIEW';
        updates.approvedAt = null;
    }
    const product2 = await database_1.prisma.$transaction(async (tx) => {
        const result = await tx.product.update({
            where: { id: product.id },
            data: updates,
            include: vendorProductInclude,
        });
        if (newImageUrls.length > 0) {
            await tx.productImage.deleteMany({ where: { productId: product.id } });
            await tx.productImage.createMany({
                data: newImageUrls.map((url, index) => ({
                    productId: product.id,
                    url,
                    sortOrder: index,
                    alt: `${result.name} image ${index + 1}`,
                })),
            });
        }
        if (input.variations !== undefined) {
            await tx.productVariation.deleteMany({ where: { productId: product.id } });
            if (input.variations.length > 0) {
                await tx.productVariation.createMany({
                    data: input.variations.map((variation) => ({
                        productId: product.id,
                        name: variation.name,
                        value: variation.value,
                        priceDelta: variation.priceDelta ?? 0,
                    })),
                });
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
            });
        }
        return tx.product.findUniqueOrThrow({
            where: { id: product.id },
            include: vendorProductInclude,
        });
    });
    return serializeVendorProduct(product2);
}
async function setVendorProductActive(vendorId, productId, isActive) {
    if (isActive) {
        const vendor = await database_1.prisma.vendor.findUnique({ where: { id: vendorId } });
        if (!vendor)
            throw new errors_1.NotFoundError('Vendor account not found.');
        assertVendorSellable(vendor);
    }
    const product = await database_1.prisma.product.findFirst({
        where: { id: productId, vendorId },
        include: vendorProductInclude,
    });
    if (!product)
        throw new errors_1.NotFoundError('Product not found.');
    if (product.status !== 'ACTIVE' && isActive) {
        throw new errors_1.UnprocessableError('Only approved products can be reactivated.');
    }
    const updated = await database_1.prisma.product.update({
        where: { id: product.id },
        data: { isActive },
        include: vendorProductInclude,
    });
    return serializeVendorProduct(updated);
}
async function deleteVendorProduct(vendorId, productId) {
    const product = await database_1.prisma.product.findFirst({
        where: { id: productId, vendorId },
        select: { id: true, orderItems: { select: { id: true }, take: 1 } },
    });
    if (!product)
        throw new errors_1.NotFoundError('Product not found.');
    if (product.orderItems.length > 0) {
        // Orders reference this product — archive instead of destroying history.
        await database_1.prisma.product.update({
            where: { id: productId },
            data: { status: 'ARCHIVED', isActive: false },
        });
        return;
    }
    await database_1.prisma.product.delete({ where: { id: productId } });
}
async function listVendorOrderItems(vendorId, query) {
    const { offset, limit } = (0, response_1.getPagination)(query);
    const where = {
        vendorId,
        ...(query.status ? { status: query.status } : {}),
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
    };
    const [rows, total] = await Promise.all([
        database_1.prisma.shopOrderItem.findMany({
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
        database_1.prisma.shopOrderItem.count({ where }),
    ]);
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
    };
}
const ITEM_STATUS_FLOW = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED'],
};
async function updateVendorOrderItem(vendorId, itemId, input) {
    const item = await database_1.prisma.shopOrderItem.findFirst({
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
    });
    if (!item)
        throw new errors_1.NotFoundError('Order item not found.');
    if (item.order.paymentStatus !== 'PAID' && input.status !== 'CANCELLED') {
        throw new errors_1.UnprocessableError('This order is not paid yet — the item cannot be prepared or shipped.');
    }
    const allowed = ITEM_STATUS_FLOW[item.status] ?? [];
    if (!allowed.includes(input.status)) {
        throw new errors_1.UnprocessableError(`Cannot move this item from ${item.status} to ${input.status}.`);
    }
    const updated = await database_1.prisma.$transaction(async (tx) => {
        const result = await tx.shopOrderItem.update({
            where: { id: item.id },
            data: {
                status: input.status,
                ...(input.trackingInfo ? { trackingInfo: input.trackingInfo } : {}),
                ...(input.status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
                ...(input.status === 'SHIPPED' ? { shippedAt: new Date() } : {}),
                ...(input.status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
                ...(input.status === 'CANCELLED' ? { cancelReason: input.cancelReason || 'Cancelled by vendor' } : {}),
            },
            include: {
                order: { select: { referenceCode: true } },
            },
        });
        if (input.status === 'CANCELLED' && item.order.paymentStatus === 'PAID') {
            // Paid order, vendor cannot supply → auto-refund this vendor's line.
            await handleLineRefund(item.order.id, item.vendorId, Number(item.lineTotal), 'Vendor cancelled the item', tx);
        }
        if (input.status === 'CANCELLED') {
            await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
            });
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
            });
        }
        // Roll the parent order up: delivered when every line is done; processing otherwise.
        const siblings = await tx.shopOrderItem.findMany({
            where: { orderId: item.order.id },
            select: { status: true, vendorId: true },
        });
        const others = siblings;
        const allDelivered = others.every((row) => row.status === 'DELIVERED');
        const anyShippedOrPreparing = others.some((row) => ['SHIPPED', 'PREPARING', 'DELIVERED'].includes(row.status));
        const allCancelled = others.every((row) => row.status === 'CANCELLED' || row.status === 'RETURNED');
        const parentStatus = allCancelled
            ? 'CANCELLED'
            : allDelivered
                ? 'DELIVERED'
                : anyShippedOrPreparing
                    ? item.order.status === 'READY_FOR_DISPATCH' || item.order.status === 'PROCESSING'
                        ? item.order.status
                        : 'PROCESSING'
                    : item.order.status;
        if (allDelivered && item.order.status !== 'DELIVERED') {
            await tx.shopOrder.update({
                where: { id: item.order.id },
                data: { status: 'DELIVERED', deliveredAt: new Date() },
            });
        }
        else if (allCancelled && item.order.status !== 'CANCELLED') {
            await tx.shopOrder.update({
                where: { id: item.order.id },
                data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'All items cancelled by vendors' },
            });
        }
        else if (parentStatus !== item.order.status && item.order.status === 'AWAITING_PAYMENT') {
            // Payment-confirmed orders only — never override the awaiting state.
        }
        else if (anyShippedOrPreparing && item.order.status === 'PAYMENT_CONFIRMED') {
            await tx.shopOrder.update({
                where: { id: item.order.id },
                data: { status: 'PROCESSING' },
            });
        }
        return result;
    });
    const fresh = await database_1.prisma.shopOrderItem.findUniqueOrThrow({
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
    });
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
    };
}
/**
 * Refunds one vendor's line of a paid order: reverses (not deletes) the
 * commission ledger, records a ShopRefund, and adjusts the order's refunded
 * total. If the whole order ends up refunded, the order + payment flip to
 * REFUNDED. Safe under concurrency via the unique ledger row + status guards.
 */
async function handleLineRefund(orderId, vendorId, amount, reason, tx) {
    const order = await tx.shopOrder.findUnique({
        where: { id: orderId },
        include: { ledger: true, items: true },
    });
    if (!order)
        return;
    await tx.shopRefund.create({
        data: {
            orderId,
            vendorId,
            reason,
            amount,
            status: 'COMPLETED',
            requestedBy: 'SYSTEM',
        },
    });
    await tx.shopOrder.update({
        where: { id: orderId },
        data: {
            refundedAmount: { increment: amount },
            refundedAt: new Date(),
        },
    });
    // Reverse the ledger entries for this vendor (or all lines when vendorId is null).
    const ledgerEntries = order.ledger.filter((entry) => (vendorId === null || entry.vendorId === vendorId) && entry.settlementStatus !== 'PAID');
    for (const entry of ledgerEntries) {
        if (entry.settlementStatus === 'REVERSED')
            continue;
        await tx.commissionLedger.update({
            where: { id: entry.id },
            data: {
                settlementStatus: 'REVERSED',
                reversedAmount: entry.vendorNet,
                releasedAt: null,
                payoutId: null,
            },
        });
    }
    // Vendor share already paid out on a PAID entry becomes a negative adjustment.
    const paidEntries = order.ledger.filter((entry) => (vendorId === null || entry.vendorId === vendorId) && entry.settlementStatus === 'PAID');
    for (const entry of paidEntries) {
        await tx.commissionLedger.update({
            where: { id: entry.id },
            data: { reversedAmount: entry.vendorNet },
        });
    }
    const refundedTotal = Number(order.refundedAmount) + amount;
    const fullyRefunded = refundedTotal >= Number(order.totalAmount) - 0.01;
    if (fullyRefunded) {
        await tx.shopOrder.update({
            where: { id: orderId },
            data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' },
        });
        await tx.shopPayment.updateMany({
            where: { orderId },
            data: { status: 'REFUNDED' },
        });
    }
    await (0, shopService_1.recordPaymentEvent)(orderId, {
        type: 'REFUND_PROCESSED',
        status: 'REFUNDED',
        amount,
        actorRole: 'SYSTEM',
        detail: reason,
    }, tx);
    if (vendorId !== null) {
        await tx.vendorNotification.create({
            data: {
                vendorId,
                type: 'REFUND',
                title: 'Refund processed',
                message: `${(0, marketplaceService_1.naira)(amount)} for order ${order.referenceCode} has been refunded. Reason: ${reason}`,
            },
        });
    }
}
/**
 * Moves matured PENDING ledger entries to RELEASED: payment confirmed AND the
 * item delivered AND the release delay elapsed. Called lazily on reads.
 */
async function releaseMaturedEarnings(tx = database_1.prisma) {
    const settings = await (0, marketplaceService_1.getMarketplaceSettings)(tx);
    const delayMs = settings.releaseDelayDays * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - delayMs);
    const matured = await tx.commissionLedger.findMany({
        where: {
            settlementStatus: 'PENDING',
            orderItem: { status: 'DELIVERED', deliveredAt: { not: null, lte: cutoff } },
        },
        select: { id: true },
    });
    if (matured.length === 0)
        return;
    await tx.commissionLedger.updateMany({
        where: { id: { in: matured.map((row) => row.id) }, settlementStatus: 'PENDING' },
        data: { settlementStatus: 'RELEASED', releasedAt: new Date() },
    });
}
async function getVendorEarnings(vendorId, query) {
    await releaseMaturedEarnings();
    const vendor = await database_1.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } });
    const settings = await (0, marketplaceService_1.getMarketplaceSettings)();
    const where = {
        vendorId,
        ...(query.settlementStatus ? { settlementStatus: query.settlementStatus } : {}),
    };
    const [rows, total, aggregates, payouts] = await Promise.all([
        database_1.prisma.commissionLedger.findMany({
            where,
            include: {
                order: { select: { referenceCode: true } },
                product: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: (query.page - 1) * query.perPage,
            take: query.perPage,
        }),
        database_1.prisma.commissionLedger.count({ where }),
        database_1.prisma.commissionLedger.groupBy({
            by: ['settlementStatus'],
            where: { vendorId },
            _sum: { vendorNet: true, reversedAmount: true },
        }),
        database_1.prisma.vendorPayout.findMany({
            where: { vendorId },
            orderBy: { requestedAt: 'desc' },
            take: 20,
        }),
    ]);
    const sumFor = (status) => Number(aggregates.find((row) => row.settlementStatus === status)?._sum.vendorNet ?? 0);
    return {
        balances: {
            pending: round2(sumFor('PENDING')),
            available: round2(sumFor('RELEASED')),
            paid: round2(sumFor('PAID')),
            reversed: round2(aggregates.reduce((totalSum, row) => totalSum + Number(row._sum.reversedAmount ?? 0), 0)),
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
    };
}
/**
 * Vendor requests a payout. The RELEASED entries are claimed (payoutId set) in
 * the same transaction — a single earning can never fund two payouts, and an
 * already-claimed entry is invisible to the next request.
 */
async function requestVendorPayout(vendorId, input) {
    await releaseMaturedEarnings();
    const vendor = await database_1.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor)
        throw new errors_1.NotFoundError('Vendor not found.');
    if (!vendor.bankName || !vendor.bankAccountNumber || !vendor.bankAccountName) {
        throw new errors_1.UnprocessableError('Add your bank account details in Vendor Settings before requesting a payout.');
    }
    const openPayout = await database_1.prisma.vendorPayout.findFirst({
        where: { vendorId, status: { in: ['REQUESTED', 'APPROVED'] } },
    });
    if (openPayout) {
        throw new errors_1.UnprocessableError('You already have a payout request awaiting processing.');
    }
    const requested = round2(input.amount);
    await database_1.prisma.$transaction(async (tx) => {
        const available = await tx.commissionLedger.findMany({
            where: { vendorId, settlementStatus: 'RELEASED', payoutId: null },
            orderBy: { releasedAt: 'asc' },
        });
        const availableTotal = round2(available.reduce((sum, row) => sum + Number(row.vendorNet), 0));
        if (requested > availableTotal + 0.01) {
            throw new errors_1.UnprocessableError(`Requested amount exceeds your available balance of ${(0, marketplaceService_1.naira)(availableTotal)}.`);
        }
        // Claim entries oldest-first until the requested amount is covered.
        let remaining = requested;
        const claimed = [];
        for (const entry of available) {
            if (remaining <= 0.01)
                break;
            claimed.push(entry.id);
            remaining = round2(remaining - Number(entry.vendorNet));
        }
        const payout = await tx.vendorPayout.create({
            data: {
                referenceCode: (0, shopService_1.generateReference)('PAY'),
                vendorId,
                amount: requested,
                status: 'REQUESTED',
                note: input.note?.trim() || null,
            },
        });
        await tx.commissionLedger.updateMany({
            where: { id: { in: claimed } },
            data: { payoutId: payout.id },
        });
        await tx.marketplaceAuditLog.create({
            data: {
                actorRole: 'VENDOR',
                actorId: vendorId,
                actorName: vendor.businessName,
                action: 'PAYOUT_REQUESTED',
                entityType: 'VendorPayout',
                entityId: payout.id,
                detail: `${vendor.businessName} requested ${(0, marketplaceService_1.naira)(requested)}`,
            },
        });
    });
    return { message: `Payout request for ${(0, marketplaceService_1.naira)(requested)} submitted. It will be processed by the administrator.` };
}
//# sourceMappingURL=vendorService.js.map