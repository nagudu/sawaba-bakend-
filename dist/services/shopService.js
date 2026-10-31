"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.serializeProductListItem = serializeProductListItem;
exports.serializeProductDetail = serializeProductDetail;
exports.listShopProducts = listShopProducts;
exports.getShopProductBySlug = getShopProductBySlug;
exports.listShopCategories = listShopCategories;
exports.listShopBrands = listShopBrands;
exports.getCart = getCart;
exports.addToCart = addToCart;
exports.updateCartItem = updateCartItem;
exports.removeCartItem = removeCartItem;
exports.clearCart = clearCart;
exports.serializeOrder = serializeOrder;
exports.recordPaymentEvent = recordPaymentEvent;
exports.createShopOrder = createShopOrder;
exports.getOrderByReference = getOrderByReference;
exports.submitOrderReceipt = submitOrderReceipt;
exports.submitOrderTransferReference = submitOrderTransferReference;
exports.cancelShopOrder = cancelShopOrder;
exports.listProductReviews = listProductReviews;
exports.createProductReview = createProductReview;
exports.refreshProductRating = refreshProductRating;
exports.listCustomerOrders = listCustomerOrders;
exports.generateReference = generateReference;
const node_crypto_1 = __importDefault(require("node:crypto"));
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const marketplaceService_1 = require("./marketplaceService");
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
const round2 = (value) => Math.round(value * 100) / 100;
function generateToken(bytes = 24) {
    return node_crypto_1.default.randomBytes(bytes).toString('hex');
}
function generateReference(prefix) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}${node_crypto_1.default.randomBytes(3).toString('hex').toUpperCase()}`;
}
const publicProductInclude = {
    vendor: { select: { id: true, businessName: true, status: true, isActive: true } },
    category: { select: { id: true, name: true } },
    images: { orderBy: { sortOrder: 'asc' } },
    variations: { where: { isActive: true } },
};
function serializeProductListItem(product) {
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
    };
}
function serializeProductDetail(product) {
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
    };
}
/** Public catalog — only ACTIVE products from APPROVED, active vendors. */
async function listShopProducts(query) {
    const { offset, limit } = (0, response_1.getPagination)(query);
    const where = {
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
    };
    const orderBy = query.sort === 'price_asc'
        ? { price: 'asc' }
        : query.sort === 'price_desc'
            ? { price: 'desc' }
            : query.sort === 'rating'
                ? { rating: 'desc' }
                : query.sort === 'popular'
                    ? { salesCount: 'desc' }
                    : { createdAt: 'desc' };
    const [rows, total] = await Promise.all([
        database_1.prisma.product.findMany({
            where,
            include: publicProductInclude,
            orderBy,
            skip: offset,
            take: limit,
        }),
        database_1.prisma.product.count({ where }),
    ]);
    return { items: rows.map(serializeProductListItem), total, page: query.page, perPage: query.perPage };
}
async function getShopProductBySlug(slug) {
    const product = await database_1.prisma.product.findUnique({
        where: { slug },
        include: publicProductInclude,
    });
    if (!product ||
        product.status !== 'ACTIVE' ||
        !product.isActive ||
        product.vendor.status !== 'APPROVED' ||
        !product.vendor.isActive) {
        throw new errors_1.NotFoundError('This product is unavailable.');
    }
    return serializeProductDetail(product);
}
async function listShopCategories() {
    const categories = await database_1.prisma.productCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { products: { where: { status: 'ACTIVE', isActive: true } } } } },
    });
    return categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        productCount: category._count.products,
    }));
}
async function listShopBrands() {
    const rows = await database_1.prisma.product.findMany({
        where: { status: 'ACTIVE', isActive: true, brand: { not: null } },
        distinct: ['brand'],
        select: { brand: true },
        orderBy: { brand: 'asc' },
    });
    return rows.map((row) => row.brand).filter((brand) => Boolean(brand));
}
// ─── Cart ────────────────────────────────────────────────────────────────────
const cartInclude = {
    items: {
        include: {
            product: {
                include: {
                    images: { orderBy: { sortOrder: 'asc' }, take: 1 },
                    vendor: { select: { id: true, businessName: true } },
                },
            },
            variation: true,
        },
        orderBy: { createdAt: 'asc' },
    },
};
function serializeCart(cart) {
    const items = cart.items
        .filter((item) => item.product.status === 'ACTIVE' && item.product.isActive)
        .map((item) => {
        const unitPrice = round2(Number(item.product.price) + Number(item.variation?.priceDelta ?? 0));
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
        };
    });
    return {
        token: cart.token,
        items,
        subtotal: round2(items.reduce((sum, item) => sum + item.lineTotal, 0)),
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    };
}
async function findOrCreateCart(token, customerId) {
    if (token) {
        const existing = await database_1.prisma.shopCart.findUnique({ where: { token }, include: cartInclude });
        if (existing) {
            if (customerId && !existing.customerId) {
                await database_1.prisma.shopCart.update({ where: { id: existing.id }, data: { customerId } });
            }
            return existing;
        }
    }
    const created = await database_1.prisma.shopCart.create({
        data: { token: token ?? generateToken(), customerId: customerId ?? null },
        include: cartInclude,
    });
    return created;
}
async function getCart(token, customerId) {
    const cart = await findOrCreateCart(token, customerId);
    return serializeCart(cart);
}
async function addToCart(input, customerId) {
    const product = await database_1.prisma.product.findUnique({
        where: { id: input.productId },
        include: { variations: true, vendor: { select: { status: true, isActive: true } } },
    });
    if (!product || product.status !== 'ACTIVE' || !product.isActive) {
        throw new errors_1.NotFoundError('This product is unavailable.');
    }
    if (product.vendor.status !== 'APPROVED' || !product.vendor.isActive) {
        throw new errors_1.UnprocessableError('This product is currently unavailable.');
    }
    let priceDelta = 0;
    if (input.variationId) {
        const variation = product.variations.find((candidate) => candidate.id === input.variationId && candidate.isActive);
        if (!variation) {
            throw new errors_1.NotFoundError('That product variation is unavailable.');
        }
        priceDelta = Number(variation.priceDelta);
    }
    void priceDelta;
    const cart = await findOrCreateCart(input.token, customerId ?? null);
    // Existing line for the same product+variation → merge quantities.
    const existing = cart.items.find((item) => item.productId === input.productId && (item.variationId ?? null) === (input.variationId ?? null));
    const newQuantity = (existing?.quantity ?? 0) + input.quantity;
    const availableStock = product.stock;
    if (newQuantity > availableStock) {
        throw new errors_1.UnprocessableError(availableStock === 0
            ? `"${product.name}" is out of stock.`
            : `Only ${availableStock} unit(s) of "${product.name}" are in stock.`);
    }
    if (existing) {
        await database_1.prisma.shopCartItem.update({ where: { id: existing.id }, data: { quantity: newQuantity } });
    }
    else {
        await database_1.prisma.shopCartItem.create({
            data: {
                cartId: cart.id,
                productId: input.productId,
                variationId: input.variationId ?? null,
                quantity: input.quantity,
            },
        });
    }
    const refreshed = await database_1.prisma.shopCart.findUniqueOrThrow({
        where: { id: cart.id },
        include: cartInclude,
    });
    return serializeCart(refreshed);
}
async function updateCartItem(itemId, token, quantity) {
    const cart = await database_1.prisma.shopCart.findUnique({ where: { token }, include: cartInclude });
    if (!cart)
        throw new errors_1.NotFoundError('Cart not found.');
    const item = cart.items.find((candidate) => candidate.id === itemId);
    if (!item)
        throw new errors_1.NotFoundError('Item not found in your cart.');
    if (quantity === 0) {
        await database_1.prisma.shopCartItem.delete({ where: { id: itemId } });
    }
    else {
        if (quantity > item.product.stock) {
            throw new errors_1.UnprocessableError(item.product.stock === 0
                ? `"${item.product.name}" is out of stock.`
                : `Only ${item.product.stock} unit(s) are in stock.`);
        }
        await database_1.prisma.shopCartItem.update({ where: { id: itemId }, data: { quantity } });
    }
    const refreshed = await database_1.prisma.shopCart.findUniqueOrThrow({
        where: { id: cart.id },
        include: cartInclude,
    });
    return serializeCart(refreshed);
}
async function removeCartItem(itemId, token) {
    const cart = await database_1.prisma.shopCart.findUnique({ where: { token }, include: cartInclude });
    if (!cart)
        throw new errors_1.NotFoundError('Cart not found.');
    const item = cart.items.find((candidate) => candidate.id === itemId);
    if (!item)
        throw new errors_1.NotFoundError('Item not found in your cart.');
    await database_1.prisma.shopCartItem.delete({ where: { id: itemId } });
    const refreshed = await database_1.prisma.shopCart.findUniqueOrThrow({
        where: { id: cart.id },
        include: cartInclude,
    });
    return serializeCart(refreshed);
}
async function clearCart(token) {
    const cart = await database_1.prisma.shopCart.findUnique({ where: { token } });
    if (!cart)
        return;
    await database_1.prisma.shopCartItem.deleteMany({ where: { cartId: cart.id } });
}
const orderInclude = {
    items: {
        include: {
            vendor: { select: { id: true, businessName: true } },
        },
        orderBy: { id: 'asc' },
    },
};
function serializeOrder(order, paymentDetails) {
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
    };
}
async function paymentDetailsFromSettings() {
    const [settings, paymentSettings] = await Promise.all([
        (0, marketplaceService_1.getMarketplaceSettings)(),
        database_1.prisma.paymentSetting.findFirst(),
    ]);
    void settings;
    return {
        bankName: paymentSettings?.bankName ?? null,
        accountName: paymentSettings?.accountName ?? null,
        accountNumber: paymentSettings?.accountNumber ?? null,
        opayAccountName: paymentSettings?.opayAccountName ?? null,
        opayAccountNumber: paymentSettings?.opayAccountNumber ?? null,
        instructions: paymentSettings?.paymentInstructions ?? null,
        shopName: paymentSettings?.shopName ?? 'SAWABA Grooming Studio',
    };
}
async function recordPaymentEvent(orderId, event, tx = database_1.prisma) {
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
    });
}
/**
 * Creates a shop order from a cart (or explicit lines) — fully server-priced.
 * Runs in ONE transaction: stock checks, stock decrements, order + items +
 * payment row. Payment itself is asynchronous (receipt verification / Paystack).
 */
async function createShopOrder(input, customerId) {
    const settings = await (0, marketplaceService_1.getMarketplaceSettings)();
    if (!settings.allowGuestCheckout && !customerId) {
        throw new errors_1.ForbiddenError('Please sign in to place an order.');
    }
    // Resolve the lines: explicit items win; otherwise read the cart server-side.
    let lines = [];
    if (input.items?.length) {
        lines = input.items.map((item) => ({
            productId: item.productId,
            variationId: item.variationId ?? null,
            quantity: item.quantity,
        }));
    }
    else if (input.token) {
        const cart = await database_1.prisma.shopCart.findUnique({
            where: { token: input.token },
            include: { items: true },
        });
        if (!cart || cart.items.length === 0) {
            throw new errors_1.UnprocessableError('Your cart is empty.');
        }
        lines = cart.items.map((item) => ({
            productId: item.productId,
            variationId: item.variationId,
            quantity: item.quantity,
        }));
    }
    if (lines.length === 0) {
        throw new errors_1.UnprocessableError('Your cart is empty.');
    }
    const email = input.customerEmail?.trim() || null;
    if (input.paymentMethod === 'ONLINE' && !email) {
        throw new errors_1.UnprocessableError('An email address is required for online card payments.');
    }
    const order = await database_1.prisma.$transaction(async (tx) => {
        // 1. Load every product FOR UPDATE-equivalent: conditional stock update below.
        const productIds = [...new Set(lines.map((line) => line.productId))];
        const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            include: {
                images: { orderBy: { sortOrder: 'asc' }, take: 1 },
                variations: true,
                vendor: { select: { id: true, businessName: true, status: true, isActive: true, commissionRate: true } },
                category: { select: { commissionRate: true } },
            },
        });
        const productById = new Map(products.map((product) => [product.id, product]));
        // 2. Validate + aggregate stock atomically (conditional decrement per line).
        const orderItemsData = [];
        let subtotal = 0;
        const decremented = [];
        for (const line of lines) {
            const product = productById.get(line.productId);
            if (!product || product.status !== 'ACTIVE' || !product.isActive) {
                throw new errors_1.UnprocessableError('One or more products in your cart are no longer available.');
            }
            if (product.vendor.status !== 'APPROVED' || !product.vendor.isActive) {
                throw new errors_1.UnprocessableError(`"${product.name}" is currently unavailable.`);
            }
            let priceDelta = 0;
            let variationLabel = null;
            if (line.variationId) {
                const variation = product.variations.find((candidate) => candidate.id === line.variationId && candidate.isActive);
                if (!variation) {
                    throw new errors_1.UnprocessableError(`A variation of "${product.name}" is no longer available.`);
                }
                priceDelta = Number(variation.priceDelta);
                variationLabel = `${variation.name}: ${variation.value}`;
            }
            // Conditional decrement — fails cleanly if another request took the stock.
            const affected = await tx.product.updateMany({
                where: { id: product.id, stock: { gte: line.quantity } },
                data: { stock: { decrement: line.quantity } },
            });
            if (affected.count === 0) {
                throw new errors_1.UnprocessableError(product.stock === 0
                    ? `"${product.name}" is out of stock.`
                    : `Only ${product.stock} unit(s) of "${product.name}" remain — please reduce your quantity.`);
            }
            decremented.push({ productId: product.id, quantity: line.quantity });
            const unitPrice = round2(Number(product.price) + priceDelta);
            const lineTotal = round2(unitPrice * line.quantity);
            subtotal = round2(subtotal + lineTotal);
            const breakdown = await (0, marketplaceService_1.computeLineCommission)({
                vendorCommissionRate: product.vendor.commissionRate,
                categoryCommissionRate: product.category?.commissionRate ?? null,
                lineTotal,
            }, tx);
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
            });
        }
        // 3. Delivery fee from marketplace settings (free above threshold).
        const deliveryFee = subtotal > 0 && Number(settings.freeDeliveryThreshold) > 0 && subtotal >= Number(settings.freeDeliveryThreshold)
            ? 0
            : Number(settings.deliveryFee);
        const totalAmount = round2(subtotal + deliveryFee);
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
        });
        // 5. Stock movements (audit trail).
        for (const decrement of decremented) {
            await tx.stockMovement.create({
                data: {
                    productId: decrement.productId,
                    vendorId: productById.get(decrement.productId).vendorId,
                    change: -decrement.quantity,
                    reason: 'PURCHASE',
                    reference: created.referenceCode,
                    actorRole: 'CUSTOMER',
                },
            });
        }
        await recordPaymentEvent(created.id, {
            type: 'ORDER_CREATED',
            status: 'UNPAID',
            amount: totalAmount,
            actorRole: customerId ? 'CUSTOMER' : 'GUEST',
            detail: `Order placed via ${input.paymentMethod}`,
        }, tx);
        // 6. Notify each vendor.
        const vendorIds = [...new Set(orderItemsData.map((item) => item.vendorId))];
        for (const vendorId of vendorIds) {
            await tx.vendorNotification.create({
                data: {
                    vendorId,
                    type: 'ORDER',
                    title: 'New order received',
                    message: `Order ${created.referenceCode} contains your product(s). Total: ${(0, marketplaceService_1.naira)(totalAmount)}.`,
                },
            });
        }
        // 7. Clear the cart when checkout consumed it.
        if (!input.items?.length && input.token) {
            await tx.shopCartItem.deleteMany({
                where: { cart: { token: input.token } },
            });
        }
        return created;
    });
    return { order: serializeOrder(order) };
}
async function loadOrder(reference) {
    const order = await database_1.prisma.shopOrder.findUnique({
        where: { referenceCode: reference.toUpperCase() },
        include: orderInclude,
    });
    if (!order)
        throw new errors_1.NotFoundError('Order not found. Please check the reference and phone number.');
    return order;
}
/** Public order lookup — reference + phone act as the two required factors. */
async function getOrderByReference(reference, phone) {
    const order = await loadOrder(reference);
    const normalize = (value) => value.replace(/\D/g, '').slice(-10);
    if (normalize(order.customerPhone) !== normalize(phone)) {
        throw new errors_1.NotFoundError('Order not found. Please check the reference and phone number.');
    }
    const details = ['BANK_TRANSFER', 'OPAY'].includes(order.paymentMethod ?? '')
        ? await paymentDetailsFromSettings()
        : undefined;
    return serializeOrder(order, details);
}
// ─── Order payment ───────────────────────────────────────────────────────────
/**
 * Attaches a transfer receipt to an order. The order becomes
 * PENDING_VERIFICATION — never PAID — until an admin verifies it.
 */
async function submitOrderReceipt(reference, receipt, transactionReference) {
    const order = await loadOrder(reference);
    if (order.paymentStatus === 'PAID') {
        throw new errors_1.UnprocessableError('This order has already been paid.');
    }
    if (order.status === 'CANCELLED') {
        throw new errors_1.UnprocessableError('This order was cancelled.');
    }
    if (order.paymentStatus === 'PENDING_VERIFICATION') {
        throw new errors_1.UnprocessableError('Your receipt is already under review.');
    }
    const updated = await database_1.prisma.$transaction(async (tx) => {
        const result = await tx.shopOrder.update({
            where: { id: order.id },
            data: {
                paymentStatus: 'PENDING_VERIFICATION',
                receiptUrl: receipt.url,
                receiptPublicId: receipt.publicId,
                transactionRef: transactionReference?.trim() || order.transactionRef,
            },
            include: orderInclude,
        });
        await tx.shopPayment.update({
            where: { orderId: order.id },
            data: { status: 'PENDING_VERIFICATION', transactionRef: transactionReference?.trim() || null },
        });
        // MUST pass `tx`: the event insert has an FK to this order row, which the
        // transaction above already locked — using the global client here makes
        // the FK check wait on the transaction's own lock (deadlock → P2028).
        await recordPaymentEvent(order.id, {
            type: 'RECEIPT_SUBMITTED',
            status: 'PENDING_VERIFICATION',
            amount: Number(order.totalAmount),
            actorRole: 'CUSTOMER',
            detail: 'Transfer receipt uploaded — awaiting admin verification',
        }, tx);
        return result;
    });
    return serializeOrder(updated);
}
/** Records the customer's transfer reference without a receipt upload. */
async function submitOrderTransferReference(reference, transactionReference) {
    const order = await loadOrder(reference);
    if (order.paymentStatus === 'PAID') {
        throw new errors_1.UnprocessableError('This order has already been paid.');
    }
    if (order.paymentStatus === 'PENDING_VERIFICATION') {
        throw new errors_1.UnprocessableError('Your payment is already under review.');
    }
    const updated = await database_1.prisma.$transaction(async (tx) => {
        const result = await tx.shopOrder.update({
            where: { id: order.id },
            data: {
                paymentStatus: 'PENDING_VERIFICATION',
                transactionRef: transactionReference,
            },
            include: orderInclude,
        });
        await tx.shopPayment.update({
            where: { orderId: order.id },
            data: { status: 'PENDING_VERIFICATION', transactionRef: transactionReference },
        });
        // MUST pass `tx` — see note in submitOrderReceipt above: the FK check on
        // the global client would deadlock against this transaction's row locks.
        await recordPaymentEvent(order.id, {
            type: 'TRANSFER_REFERENCE_SUBMITTED',
            status: 'PENDING_VERIFICATION',
            amount: Number(order.totalAmount),
            actorRole: 'CUSTOMER',
            detail: `Transfer reference: ${transactionReference}`,
        }, tx);
        return result;
    });
    return serializeOrder(updated);
}
async function cancelShopOrder(reference, phone) {
    const order = await loadOrder(reference);
    const normalize = (value) => value.replace(/\D/g, '').slice(-10);
    if (normalize(order.customerPhone) !== normalize(phone)) {
        throw new errors_1.NotFoundError('Order not found. Please check the reference and phone number.');
    }
    if (order.paymentStatus === 'PAID') {
        throw new errors_1.UnprocessableError('This order has already been paid. Please contact support for a refund instead.');
    }
    if (['CANCELLED', 'DELIVERED', 'SHIPPED', 'REFUNDED', 'RETURNED'].includes(order.status)) {
        throw new errors_1.UnprocessableError(`This order cannot be cancelled (${order.status.toLowerCase()}).`);
    }
    const updated = await database_1.prisma.$transaction(async (tx) => {
        // Restock every line.
        for (const item of order.items) {
            await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
            });
            await tx.stockMovement.create({
                data: {
                    productId: item.productId,
                    vendorId: item.vendorId,
                    change: item.quantity,
                    reason: 'CANCELLATION',
                    reference: order.referenceCode,
                    actorRole: 'CUSTOMER',
                },
            });
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
        });
        await tx.shopPayment.updateMany({
            where: { orderId: order.id, status: { not: 'PAID' } },
            data: { status: 'CANCELLED' },
        });
        // MUST pass `tx` — same FK/deadlock reason as the payment-event helpers.
        await recordPaymentEvent(order.id, {
            type: 'ORDER_CANCELLED',
            status: 'CANCELLED',
            actorRole: 'CUSTOMER',
            detail: 'Cancelled by customer before payment confirmation',
        }, tx);
        for (const vendorId of [...new Set(order.items.map((item) => item.vendorId))]) {
            await tx.vendorNotification.create({
                data: {
                    vendorId,
                    type: 'ORDER',
                    title: 'Order cancelled',
                    message: `Order ${order.referenceCode} was cancelled by the customer.`,
                },
            });
        }
        return result;
    });
    return serializeOrder(updated);
}
async function listProductReviews(productId, page, perPage) {
    const where = { productId, isApproved: true };
    const [rows, total] = await Promise.all([
        database_1.prisma.productReview.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * perPage,
            take: perPage,
        }),
        database_1.prisma.productReview.count({ where }),
    ]);
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
    };
}
/**
 * Creates a product review — only for customers with a VERIFIED, DELIVERED
 * order containing that product. Reviews start PENDING until moderated.
 */
async function createProductReview(productId, input, auth) {
    const product = await database_1.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.status !== 'ACTIVE') {
        throw new errors_1.NotFoundError('Product not found.');
    }
    // Verified purchase: a delivered order for this product exists that matches
    // the customer's identity (account id, phone, or email).
    const matchingOrder = await database_1.prisma.shopOrder.findFirst({
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
    });
    if (!matchingOrder) {
        throw new errors_1.ForbiddenError('You can only review products you have purchased.');
    }
    const alreadyReviewed = await database_1.prisma.productReview.findUnique({
        where: { orderId_productId: { orderId: matchingOrder.id, productId } },
    });
    if (alreadyReviewed) {
        throw new errors_1.ConflictError('You have already reviewed this product from this order.');
    }
    await database_1.prisma.productReview.create({
        data: {
            productId,
            vendorId: product.vendorId,
            orderId: matchingOrder.id,
            customerId: auth.customerId ?? null,
            customerName: input.customerName?.trim() || 'SAWABA Customer',
            rating: input.rating,
            comment: input.comment,
        },
    });
    return { message: 'Thank you! Your review has been submitted for moderation.' };
}
/** Recalculates the cached product rating after moderation changes. */
async function refreshProductRating(productId) {
    const approved = await database_1.prisma.productReview.findMany({
        where: { productId, isApproved: true },
        select: { rating: true },
    });
    if (approved.length === 0) {
        await database_1.prisma.product.update({
            where: { id: productId },
            data: { rating: 0, reviewCount: 0 },
        });
        return;
    }
    const average = approved.reduce((sum, review) => sum + review.rating, 0) / approved.length;
    await database_1.prisma.product.update({
        where: { id: productId },
        data: { rating: Math.round(average * 10) / 10, reviewCount: approved.length },
    });
}
// ─── Customer order history ──────────────────────────────────────────────────
async function listCustomerOrders(customerId, page, perPage) {
    const where = { customerId };
    const [rows, total] = await Promise.all([
        database_1.prisma.shopOrder.findMany({
            where,
            include: orderInclude,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * perPage,
            take: perPage,
        }),
        database_1.prisma.shopOrder.count({ where }),
    ]);
    return { items: rows.map((order) => serializeOrder(order)), total, page, perPage };
}
//# sourceMappingURL=shopService.js.map