"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listReviewsQuerySchema = exports.updateReviewSchema = exports.createReviewSchema = exports.REVIEW_STATUSES = void 0;
const zod_1 = require("zod");
exports.REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
exports.createReviewSchema = zod_1.z.object({
    customerName: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
    customerPhone: zod_1.z.string().trim().max(32).optional().nullable(),
    customerEmail: zod_1.z
        .string()
        .trim()
        .email('Email address is not valid.')
        .max(255)
        .optional()
        .nullable(),
    customerImage: zod_1.z.string().trim().url('Image must be a valid URL.').max(500).optional().nullable(),
    serviceId: zod_1.z.coerce.number().int().positive().optional().nullable(),
    serviceName: zod_1.z.string().trim().max(150).optional().nullable(),
    barberId: zod_1.z.coerce.number().int().positive().optional().nullable(),
    rating: zod_1.z.coerce.number().int().min(1, 'Rating must be between 1 and 5.').max(5),
    comment: zod_1.z.string().trim().min(5, 'Comment must be at least 5 characters.').max(2000),
});
exports.updateReviewSchema = zod_1.z.object({
    customerName: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters.').max(150).optional(),
    customerPhone: zod_1.z.string().trim().max(32).optional().nullable(),
    customerEmail: zod_1.z.string().trim().email('Email address is not valid.').max(255).optional().nullable(),
    serviceName: zod_1.z.string().trim().max(150).optional().nullable(),
    rating: zod_1.z.coerce.number().int().min(1).max(5).optional(),
    comment: zod_1.z.string().trim().min(5).max(2000).optional(),
    status: zod_1.z.enum(exports.REVIEW_STATUSES).optional(),
    isApproved: zod_1.z.boolean().optional(),
});
exports.listReviewsQuerySchema = zod_1.z.object({
    approved: zod_1.z.enum(['true', 'false', 'all']).optional().default('true'),
    status: zod_1.z.enum([...exports.REVIEW_STATUSES, 'all']).optional(),
    search: zod_1.z.string().trim().max(200).optional(),
    barberId: zod_1.z.coerce.number().int().positive().optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
//# sourceMappingURL=review.js.map