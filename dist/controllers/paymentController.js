"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentSettingsHandler = getPaymentSettingsHandler;
exports.getPublicPaymentHandler = getPublicPaymentHandler;
exports.declareCashHandler = declareCashHandler;
exports.submitPaymentHandler = submitPaymentHandler;
exports.trackPaymentHandler = trackPaymentHandler;
exports.listPaymentsHandler = listPaymentsHandler;
exports.getPaymentByIdHandler = getPaymentByIdHandler;
exports.verifyPaymentHandler = verifyPaymentHandler;
exports.confirmCashHandler = confirmCashHandler;
exports.rejectPaymentHandler = rejectPaymentHandler;
const paymentService_1 = require("../services/paymentService");
const paymentSettingsService_1 = require("../services/paymentSettingsService");
const response_1 = require("../utils/response");
async function getPaymentSettingsHandler(_req, res, next) {
    try {
        const settings = await (0, paymentSettingsService_1.getPublicPaymentSettings)();
        (0, response_1.successRes)(res, 'Payment details retrieved.', settings, 200);
    }
    catch (error) {
        next(error);
    }
}
async function getPublicPaymentHandler(req, res, next) {
    try {
        const result = await (0, paymentService_1.getPublicPayment)(req.params.token);
        (0, response_1.successRes)(res, 'Payment details retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function declareCashHandler(req, res, next) {
    try {
        const result = await (0, paymentService_1.declareCashPayment)(req.params.token);
        (0, response_1.successRes)(res, 'Cash payment selected — please pay at the salon.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function submitPaymentHandler(req, res, next) {
    try {
        const input = req.body;
        const file = req.file;
        const result = await (0, paymentService_1.submitPayment)(req.params.token, input, file?.buffer ?? null);
        (0, response_1.successRes)(res, 'Your payment receipt has been submitted and is awaiting verification. We will notify you once it is confirmed.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function trackPaymentHandler(req, res, next) {
    try {
        const input = req.body;
        const result = await (0, paymentService_1.trackPayment)(input);
        (0, response_1.successRes)(res, 'Payment details retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function listPaymentsHandler(req, res, next) {
    try {
        const query = req.query;
        const result = await (0, paymentService_1.listPayments)(query);
        (0, response_1.successRes)(res, 'Payments retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function getPaymentByIdHandler(req, res, next) {
    try {
        const payment = await (0, paymentService_1.getPaymentById)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Payment retrieved.', payment, 200);
    }
    catch (error) {
        next(error);
    }
}
async function verifyPaymentHandler(req, res, next) {
    try {
        const adminId = req.admin?.id;
        const payment = await (0, paymentService_1.verifyPayment)(Number(req.params.id), Number(adminId));
        (0, response_1.successRes)(res, 'Payment verified. The appointment has been confirmed and marked ready for service.', payment, 200);
    }
    catch (error) {
        next(error);
    }
}
async function confirmCashHandler(req, res, next) {
    try {
        const adminId = req.admin?.id;
        const { note } = req.body;
        const payment = await (0, paymentService_1.confirmCashPayment)(Number(req.params.id), Number(adminId), note ?? null);
        (0, response_1.successRes)(res, 'Cash payment confirmed. The appointment has been confirmed.', payment, 200);
    }
    catch (error) {
        next(error);
    }
}
async function rejectPaymentHandler(req, res, next) {
    try {
        const adminId = req.admin?.id;
        const { reason } = req.body;
        const payment = await (0, paymentService_1.rejectPayment)(Number(req.params.id), reason, Number(adminId));
        (0, response_1.successRes)(res, 'Payment rejected. The customer has been moved back to the payment step.', payment, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=paymentController.js.map