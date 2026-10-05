"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReviewHandler = createReviewHandler;
exports.listReviewsHandler = listReviewsHandler;
exports.updateReviewHandler = updateReviewHandler;
exports.deleteReviewHandler = deleteReviewHandler;
const reviewService_1 = require("../services/reviewService");
const response_1 = require("../utils/response");
async function createReviewHandler(req, res, next) {
    try {
        const input = req.body;
        const review = await (0, reviewService_1.createReview)(input);
        (0, response_1.successRes)(res, 'Thank you for your review! Your feedback has been submitted successfully and is awaiting approval.', review, 201);
    }
    catch (error) {
        next(error);
    }
}
async function listReviewsHandler(req, res, next) {
    try {
        const query = req.query;
        const result = await (0, reviewService_1.listReviews)(query);
        (0, response_1.successRes)(res, 'Reviews retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function updateReviewHandler(req, res, next) {
    try {
        const input = req.body;
        const review = await (0, reviewService_1.updateReview)(Number(req.params.id), input);
        (0, response_1.successRes)(res, 'Review updated successfully.', review, 200);
    }
    catch (error) {
        next(error);
    }
}
async function deleteReviewHandler(req, res, next) {
    try {
        await (0, reviewService_1.deleteReview)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Review deleted successfully.', {}, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=reviewController.js.map