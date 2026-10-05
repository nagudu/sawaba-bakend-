"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializePaystackHandler = initializePaystackHandler;
exports.verifyPaystackHandler = verifyPaystackHandler;
exports.paystackWebhookHandler = paystackWebhookHandler;
const paystackService_1 = require("../services/paystackService");
const checkoutService_1 = require("../services/checkoutService");
const response_1 = require("../utils/response");
async function initializePaystackHandler(req, res, next) {
    try {
        const init = await (0, paystackService_1.initializePaystack)(req.params.token);
        (0, response_1.successRes)(res, 'Payment session created. Redirecting to Paystack…', init, 200);
    }
    catch (error) {
        next(error);
    }
}
async function verifyPaystackHandler(req, res, next) {
    try {
        const { reference } = req.body;
        const result = await (0, paystackService_1.verifyPaystack)(req.params.token, reference);
        (0, response_1.successRes)(res, 'Payment verified successfully.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function paystackWebhookHandler(req, res) {
    const rawBody = req.rawBody ?? '';
    const signature = req.headers['x-paystack-signature'];
    // Invalid signatures get a fast 401 — Paystack retries with valid ones.
    if (!(0, paystackService_1.isValidPaystackSignature)(rawBody, signature)) {
        res.status(401).json({ success: false, message: 'Invalid signature.' });
        return;
    }
    try {
        const payload = JSON.parse(rawBody);
        // Checkout-session payments first, then legacy appointment payments.
        let applied = await (0, checkoutService_1.handleCheckoutWebhook)(payload);
        if (!applied) {
            applied = await (0, paystackService_1.handlePaystackWebhook)(payload);
        }
        // Always 200 once the signature is valid, even for ignored events.
        res.status(200).json({ success: true, applied });
    }
    catch (error) {
        // Log but still 200 so Paystack does not spam retries on transient issues;
        // the customer-side verify path remains the reliable fallback.
        console.error('[paystack] webhook processing failed:', error.message);
        res.status(200).json({ success: true, applied: false });
    }
}
//# sourceMappingURL=paystackController.js.map