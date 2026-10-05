"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewsRouter = void 0;
const express_1 = require("express");
const reviewController_1 = require("../controllers/reviewController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const review_1 = require("../validators/review");
const appointment_1 = require("../validators/appointment");
exports.reviewsRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: List reviews
 *     description: Public reviews are approved-only; admins may request `approved=false` to review submissions.
 *     parameters:
 *       - in: query
 *         name: approved
 *         schema:
 *           type: string
 *           enum: [true, false, all]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated list of reviews.
 */
exports.reviewsRouter.get('/', (0, validate_1.validate)(review_1.listReviewsQuerySchema, 'query'), (req, res, next) => {
    // Public visitors may only browse APPROVED reviews; any other status filter
    // is an admin listing (PENDING / REJECTED / all) and requires the admin.
    // `barberId` is a PUBLIC filter — barber profiles fetch their approved
    // reviews with it, so it must not require authentication.
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const approved = typeof req.query.approved === 'string' ? req.query.approved : undefined;
    const wantsAdminList = status !== undefined || approved === 'false' || approved === 'all';
    if (wantsAdminList)
        return (0, auth_1.requireAdmin)(req, res, next);
    return next();
}, reviewController_1.listReviewsHandler);
/**
 * @swagger
 * /api/reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Submit a review (public)
 *     description: Reviews are stored as unapproved and appear publicly only after an admin approves them.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerName, rating, comment]
 *             properties:
 *               customerName:
 *                 type: string
 *               customerImage:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Review submitted (pending approval).
 */
exports.reviewsRouter.post('/', rateLimiter_1.submitLimiter, (0, validate_1.validate)(review_1.createReviewSchema), reviewController_1.createReviewHandler);
/**
 * @swagger
 * /api/reviews/{id}:
 *   patch:
 *     tags: [Reviews]
 *     summary: Update a review incl. approval (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: integer
 *               comment:
 *                 type: string
 *               isApproved:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Review updated.
 */
exports.reviewsRouter.patch('/:id', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), (0, validate_1.validate)(review_1.updateReviewSchema), reviewController_1.updateReviewHandler);
/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete a review (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Review deleted.
 */
exports.reviewsRouter.delete('/:id', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), reviewController_1.deleteReviewHandler);
//# sourceMappingURL=reviews.js.map