"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutHandler = createCheckoutHandler;
exports.getCheckoutHandler = getCheckoutHandler;
exports.initializeCheckoutPaystackHandler = initializeCheckoutPaystackHandler;
exports.verifyCheckoutPaystackHandler = verifyCheckoutPaystackHandler;
exports.finalizeCheckoutHandler = finalizeCheckoutHandler;
exports.abandonCheckoutHandler = abandonCheckoutHandler;
const checkoutService_1 = require("../services/checkoutService");
const response_1 = require("../utils/response");
/** Multipart — a transfer checkout may carry its receipt file in the same request. */
async function createCheckoutHandler(req, res, next) {
    try {
        const input = req.body;
        const receiptFile = req.file;
        const session = await (0, checkoutService_1.createCheckoutSession)({
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            customerEmail: input.customerEmail || null,
            customerLocation: input.customerLocation || null,
            serviceId: input.serviceId,
            barberId: input.barberId,
            appointmentDate: input.appointmentDate,
            appointmentTime: input.appointmentTime,
            notes: input.notes || null,
            paymentMethod: input.paymentMethod,
            transactionReference: input.transactionReference || null,
            receiptBuffer: receiptFile?.buffer ?? null,
            receiptMimetype: receiptFile?.mimetype ?? null,
        });
        (0, response_1.successRes)(res, 'Booking session created.', session, 201);
    }
    catch (error) {
        next(error);
    }
}
async function getCheckoutHandler(req, res, next) {
    try {
        const session = await (0, checkoutService_1.getCheckoutSession)(req.params.sessionToken);
        (0, response_1.successRes)(res, 'Booking session retrieved.', session, 200);
    }
    catch (error) {
        next(error);
    }
}
async function initializeCheckoutPaystackHandler(req, res, next) {
    try {
        const init = await (0, checkoutService_1.initializeCheckoutPaystack)(req.params.sessionToken);
        (0, response_1.successRes)(res, 'Payment session created. Redirecting to Paystack…', init, 200);
    }
    catch (error) {
        next(error);
    }
}
async function verifyCheckoutPaystackHandler(req, res, next) {
    try {
        const { reference } = req.body;
        const result = await (0, checkoutService_1.verifyCheckoutPaystack)(req.params.sessionToken, reference);
        (0, response_1.successRes)(res, 'Payment verified. Your appointment has been booked.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function finalizeCheckoutHandler(req, res, next) {
    try {
        const result = await (0, checkoutService_1.finalizeCheckout)(req.params.sessionToken);
        (0, response_1.successRes)(res, 'Your appointment has been submitted. We will contact you to confirm.', result, 201);
    }
    catch (error) {
        next(error);
    }
}
async function abandonCheckoutHandler(req, res, next) {
    try {
        const result = await (0, checkoutService_1.abandonCheckout)(req.params.sessionToken);
        (0, response_1.successRes)(res, 'Booking session closed.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=checkoutController.js.map