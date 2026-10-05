"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReview = createReview;
exports.listReviews = listReviews;
exports.updateReview = updateReview;
exports.deleteReview = deleteReview;
exports.approveReview = approveReview;
exports.rejectReview = rejectReview;
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
function serializeReview(review) {
    return {
        id: review.id,
        customerName: review.customerName,
        customerPhone: review.customerPhone ?? null,
        customerEmail: review.customerEmail ?? null,
        customerImage: review.customerImage,
        serviceId: review.serviceId ?? null,
        serviceName: review.serviceName ?? null,
        barberId: review.barberId ?? null,
        rating: Number(review.rating),
        comment: review.comment,
        status: review.status,
        isApproved: review.status === 'APPROVED',
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
    };
}
async function createReview(input) {
    const review = await models_1.Review.create({
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        customerEmail: input.customerEmail ?? null,
        customerImage: input.customerImage ?? null,
        serviceId: input.serviceId ?? null,
        serviceName: input.serviceName ?? null,
        barberId: input.barberId ?? null,
        rating: input.rating,
        comment: input.comment,
        status: 'PENDING',
        isApproved: false,
    });
    return serializeReview(review);
}
async function listReviews(query) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const where = {};
    if (query.status) {
        if (query.status !== 'all')
            where.status = query.status;
    }
    else if (query.approved === 'true') {
        where.status = 'APPROVED';
    }
    else if (query.approved === 'false') {
        where.status = 'PENDING';
    }
    // Filter by barber when the validated `barberId` query param is present —
    // used by barber profiles to fetch only their own approved reviews.
    if (query.barberId) {
        where.barberId = query.barberId;
    }
    if (query.search) {
        where[sequelize_1.Op.or] = [
            { customerName: { [sequelize_1.Op.like]: `%${query.search}%` } },
            { comment: { [sequelize_1.Op.like]: `%${query.search}%` } },
            { customerPhone: { [sequelize_1.Op.like]: `%${query.search}%` } },
            { customerEmail: { [sequelize_1.Op.like]: `%${query.search}%` } },
            { serviceName: { [sequelize_1.Op.like]: `%${query.search}%` } },
        ];
    }
    const { rows, count } = await models_1.Review.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        offset,
        limit,
    });
    return { items: rows.map(serializeReview), total: count, page, perPage };
}
async function updateReview(id, input) {
    const review = await models_1.Review.findByPk(id);
    if (!review) {
        throw new errors_1.NotFoundError('Review not found.');
    }
    const patch = { ...input };
    if (input.status !== undefined) {
        patch.isApproved = input.status === 'APPROVED';
    }
    else if (input.isApproved !== undefined) {
        patch.status = input.isApproved ? 'APPROVED' : 'PENDING';
    }
    await review.update(patch);
    return serializeReview(review);
}
async function deleteReview(id) {
    const review = await models_1.Review.findByPk(id);
    if (!review) {
        throw new errors_1.NotFoundError('Review not found.');
    }
    await review.destroy();
}
async function approveReview(id) {
    const review = await models_1.Review.findByPk(id);
    if (!review) {
        throw new errors_1.NotFoundError('Review not found.');
    }
    await review.update({ status: 'APPROVED', isApproved: true });
    return serializeReview(review);
}
async function rejectReview(id) {
    const review = await models_1.Review.findByPk(id);
    if (!review) {
        throw new errors_1.NotFoundError('Review not found.');
    }
    await review.update({ status: 'REJECTED', isApproved: false });
    return serializeReview(review);
}
//# sourceMappingURL=reviewService.js.map