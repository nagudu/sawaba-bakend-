"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingsRouter = void 0;
const express_1 = require("express");
const qrController_1 = require("../controllers/qrController");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const qr_1 = require("../validators/qr");
/**
 * Public booking helpers — no account required. The guest booking flow itself
 * lives on /api/checkout; this router only exposes the read-only lookup used to
 * reopen a booking's check-in QR (reference/id + the phone it was booked with).
 */
exports.bookingsRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/bookings/qr:
 *   post:
 *     tags: [Bookings]
 *     summary: Retrieve a booking's check-in QR (public)
 *     description: |
 *       Guest-friendly lookup. Requires BOTH the booking reference (or numeric
 *       id) AND the phone number used at booking. Returns the revocable QR
 *       payload plus the current payment/check-in status. The QR is not proof
 *       of payment — scanning still enforces a verified payment.
 */
exports.bookingsRouter.post('/qr', rateLimiter_1.submitLimiter, (0, validate_1.validate)(qr_1.publicBookingQrSchema), qrController_1.getPublicBookingQrHandler);
//# sourceMappingURL=bookings.js.map