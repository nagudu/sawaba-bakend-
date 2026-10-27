import { Router } from 'express'
import { getPublicBookingQrHandler } from '../controllers/qrController'
import { validate } from '../middleware/validate'
import { submitLimiter } from '../middleware/rateLimiter'
import { publicBookingQrSchema } from '../validators/qr'

/**
 * Public booking helpers — no account required. The guest booking flow itself
 * lives on /api/checkout; this router only exposes the read-only lookup used to
 * reopen a booking's check-in QR (reference/id + the phone it was booked with).
 */
export const bookingsRouter = Router()

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
bookingsRouter.post('/qr', submitLimiter, validate(publicBookingQrSchema), getPublicBookingQrHandler)
