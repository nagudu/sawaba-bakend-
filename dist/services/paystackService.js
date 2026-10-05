"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPaystackConfigured = isPaystackConfigured;
exports.paystackPublicKey = paystackPublicKey;
exports.initializePaystack = initializePaystack;
exports.verifyPaystack = verifyPaystack;
exports.isValidPaystackSignature = isValidPaystackSignature;
exports.handlePaystackWebhook = handlePaystackWebhook;
const node_crypto_1 = __importDefault(require("node:crypto"));
const errors_1 = require("../utils/errors");
const paymentService_1 = require("./paymentService");
/**
 * Paystack online-payment integration.
 *
 * Flow (never trusts the frontend alone):
 *   1. initializePaystack   — backend creates a transaction for the appointment's
 *                             stored amount and returns Paystack's checkout URL.
 *   2. Customer pays on Paystack.
 *   3a. verifyPaystack      — backend GETs the transaction directly from Paystack
 *                             and only marks PAID when Paystack itself says success.
 *   3b. webhook             — Paystack also notifies us; the x-paystack-signature
 *                             HMAC (raw body + secret key) is validated first.
 *
 * Keys come exclusively from env: PAYSTACK_SECRET_KEY / PAYSTACK_PUBLIC_KEY.
 */
const PAYSTACK_BASE = 'https://api.paystack.co';
function secretKey() {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
        throw new errors_1.UnprocessableError('Online payment is not configured. Please contact the administrator.');
    }
    return key;
}
function isPaystackConfigured() {
    return Boolean(process.env.PAYSTACK_SECRET_KEY);
}
function paystackPublicKey() {
    return process.env.PAYSTACK_PUBLIC_KEY ?? null;
}
async function paystackRequest(method, path, body) {
    let response;
    try {
        response = await fetch(`${PAYSTACK_BASE}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${secretKey()}`,
                'Content-Type': 'application/json',
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    }
    catch (error) {
        throw new errors_1.UnprocessableError('Unable to connect to the payment gateway. Please try again.');
    }
    const json = (await response.json().catch(() => null));
    if (!response.ok || !json?.status) {
        throw new errors_1.UnprocessableError(json?.message ?? 'The payment gateway rejected this request. Please try again.');
    }
    return json.data;
}
function clientCallbackUrl(token) {
    const base = process.env.CLIENT_URL ?? 'http://localhost:5173';
    // The token must be baked into the URL: Paystack only appends ?reference= on return.
    return `${base.replace(/\/$/, '')}/payments/callback?token=${encodeURIComponent(token)}`;
}
/** Creates a Paystack transaction for the payment's appointment amount. */
async function initializePaystack(token) {
    const payment = await (0, paymentService_1.getPaymentByAccessToken)(token);
    const appointment = payment.appointment;
    if (!appointment) {
        throw new errors_1.NotFoundError('Payment record not found for this appointment.');
    }
    if (appointment.status === 'CANCELLED') {
        throw new errors_1.UnprocessableError('This appointment has been cancelled and cannot accept a payment.');
    }
    if (payment.status === 'PAID') {
        throw new errors_1.UnprocessableError('This appointment has already been paid and verified.');
    }
    if (payment.status === 'PENDING_VERIFICATION') {
        throw new errors_1.UnprocessableError('A manual payment receipt is already under review for this appointment.');
    }
    // Amount always comes from the stored appointment price, in kobo — never the client.
    const amountKobo = Math.round(Number(appointment.totalAmount) * 100);
    // Paystack requires a recipient email and rejects reserved TLDs like
    // .local — guest bookings without an email get a stable, well-formed
    // address under the salon domain (used only for the transaction record).
    const email = appointment.customerEmail ??
        `${appointment.customerPhone.replace(/\D/g, '')}@payments.sawabasalon.com`;
    const reference = `SAWABA-APT${appointment.id}-${Date.now()}`;
    const init = await paystackRequest('POST', '/transaction/initialize', {
        email,
        amount: amountKobo,
        reference,
        callback_url: clientCallbackUrl(token),
        metadata: {
            appointmentId: appointment.id,
            paymentId: payment.id,
            customerName: appointment.customerName,
        },
    });
    await payment.update({
        paymentMethod: 'ONLINE',
        transactionReference: init.reference,
    });
    return {
        authorizationUrl: init.authorization_url,
        accessCode: init.access_code,
        reference: init.reference,
    };
}
/** Re-reads the transaction from Paystack and only then marks the payment verified. */
async function verifyPaystack(token, reference) {
    const payment = await (0, paymentService_1.getPaymentByAccessToken)(token);
    if (payment.status === 'PAID') {
        // Already verified (e.g. by the webhook moments earlier) — just return current state.
        return (0, paymentService_1.applyProviderVerification)(payment.appointmentId, null);
    }
    const expectedRef = payment.transactionReference;
    if (expectedRef && reference !== expectedRef) {
        throw new errors_1.UnprocessableError('This payment reference does not match this appointment.');
    }
    const txn = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (txn.status !== 'success') {
        throw new errors_1.UnprocessableError(`Paystack reports this payment as "${txn.status}". No payment has been recorded — please try again or use bank transfer.`);
    }
    // Paystack is the authority: confirm the kobo amount matches the stored appointment price.
    const appointment = payment.appointment;
    if (!appointment) {
        throw new errors_1.NotFoundError('Payment record not found for this appointment.');
    }
    const expectedKobo = Math.round(Number(appointment.totalAmount) * 100);
    if (txn.amount !== expectedKobo) {
        throw new errors_1.UnprocessableError('The paid amount does not match the appointment price. Please contact support.');
    }
    return (0, paymentService_1.applyProviderVerification)(payment.appointmentId, {
        provider: 'paystack',
        providerRef: String(txn.id),
        adminId: null,
    });
}
/** Validates the x-paystack-signature HMAC over the RAW request body. */
function isValidPaystackSignature(rawBody, signature) {
    if (!signature || !process.env.PAYSTACK_SECRET_KEY)
        return false;
    const hash = node_crypto_1.default
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(rawBody)
        .digest('hex');
    try {
        return node_crypto_1.default.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    }
    catch {
        return false;
    }
}
/** Processes a charge.success webhook (already signature-verified). */
async function handlePaystackWebhook(payload) {
    if (payload.event !== 'charge.success')
        return false;
    const appointmentId = payload.data?.metadata?.appointmentId;
    if (!appointmentId)
        return false;
    const verified = await (0, paymentService_1.applyProviderVerification)(appointmentId, {
        provider: 'paystack',
        providerRef: String(payload.data.id ?? payload.data.reference ?? 'webhook'),
        adminId: null,
    });
    return verified.payment.status === 'PAID';
}
//# sourceMappingURL=paystackService.js.map