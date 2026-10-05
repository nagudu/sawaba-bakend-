"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestOtpHandler = requestOtpHandler;
exports.verifyOtpHandler = verifyOtpHandler;
exports.registerHandler = registerHandler;
exports.loginPasswordHandler = loginPasswordHandler;
exports.googleAuthHandler = googleAuthHandler;
exports.meHandler = meHandler;
exports.updateProfileHandler = updateProfileHandler;
exports.changePasswordHandler = changePasswordHandler;
exports.prefillHandler = prefillHandler;
const customerAuthService_1 = require("../services/customerAuthService");
const customerMeService_1 = require("../services/customerMeService");
const googleCustomerService_1 = require("../services/googleCustomerService");
const googleAuthService_1 = require("../services/googleAuthService");
const response_1 = require("../utils/response");
async function requestOtpHandler(req, res, next) {
    try {
        const { phone } = req.body;
        const result = await (0, customerAuthService_1.requestLoginOtp)(phone);
        (0, response_1.successRes)(res, result.message, result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function verifyOtpHandler(req, res, next) {
    try {
        const { phone, code } = req.body;
        const { token, customer } = await (0, customerAuthService_1.verifyLoginOtp)(phone, code);
        (0, response_1.successRes)(res, 'Welcome back! You are now logged in.', { token, customer: (0, customerAuthService_1.serializeCustomer)(customer) }, 200);
    }
    catch (error) {
        next(error);
    }
}
async function registerHandler(req, res, next) {
    try {
        const input = req.body;
        const { token, customer } = await (0, customerAuthService_1.registerCustomer)(input);
        (0, response_1.successRes)(res, 'Account created. Welcome to SAWABA!', { token, customer: (0, customerAuthService_1.serializeCustomer)(customer) }, 201);
    }
    catch (error) {
        next(error);
    }
}
async function loginPasswordHandler(req, res, next) {
    try {
        const { phone, password } = req.body;
        const { token, customer } = await (0, customerAuthService_1.loginWithPassword)(phone, password);
        (0, response_1.successRes)(res, 'Welcome back!', { token, customer: (0, customerAuthService_1.serializeCustomer)(customer) }, 200);
    }
    catch (error) {
        next(error);
    }
}
/**
 * Signs a customer in with a Google Identity Services credential. The ID token
 * is verified against Google's certificates before anything is read from it.
 */
async function googleAuthHandler(req, res, next) {
    try {
        const { credential } = req.body;
        const identity = await (0, googleAuthService_1.verifyGoogleIdToken)(credential);
        const { token, customer, outcome } = await (0, googleCustomerService_1.loginOrRegisterWithGoogle)(identity);
        const message = outcome === 'created'
            ? 'Account created. Welcome to SAWABA!'
            : outcome === 'linked'
                ? 'Google account linked. Welcome back!'
                : 'Welcome back!';
        (0, response_1.successRes)(res, message, {
            token,
            customer: (0, customerAuthService_1.serializeCustomer)(customer),
            outcome,
            needsPhone: !customer.phoneVerified,
        }, outcome === 'created' ? 201 : 200);
    }
    catch (error) {
        next(error);
    }
}
async function meHandler(req, res, next) {
    try {
        (0, response_1.successRes)(res, 'Profile retrieved.', { customer: (0, customerAuthService_1.serializeCustomer)(req.customer) }, 200);
    }
    catch (error) {
        next(error);
    }
}
async function updateProfileHandler(req, res, next) {
    try {
        const patch = req.body;
        const customer = await (0, customerAuthService_1.updateCustomerProfile)(req.customer.id, patch);
        (0, response_1.successRes)(res, 'Profile updated.', { customer: (0, customerAuthService_1.serializeCustomer)(customer) }, 200);
    }
    catch (error) {
        next(error);
    }
}
async function changePasswordHandler(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body;
        await (0, customerAuthService_1.changeCustomerPassword)(req.customer.id, currentPassword ?? null, newPassword);
        (0, response_1.successRes)(res, 'Password updated.', {}, 200);
    }
    catch (error) {
        next(error);
    }
}
/** Booking form prefill for logged-in customers (identity + usual service). */
async function prefillHandler(req, res, next) {
    try {
        const prefill = await (0, customerMeService_1.getBookingPrefill)(req.customer);
        (0, response_1.successRes)(res, 'Booking prefill retrieved.', prefill, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=customerAuthController.js.map