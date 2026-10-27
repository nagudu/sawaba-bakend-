"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminQrRouter = exports.barberQrRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const barberAuth_1 = require("../middleware/barberAuth");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const qrController_1 = require("../controllers/qrController");
const qr_1 = require("../validators/qr");
/**
 * Barber scanner endpoints — mounted at /api/barber/portal/qr. Every route is
 * scoped to the authenticated barber (the server derives the barber id from the
 * token; the client never sends it).
 */
exports.barberQrRouter = (0, express_1.Router)();
exports.barberQrRouter.use(barberAuth_1.requireBarber);
exports.barberQrRouter.use(rateLimiter_1.qrScanLimiter);
exports.barberQrRouter.post('/validate', (0, validate_1.validate)(qr_1.qrValidateBodySchema), qrController_1.validateQrHandler);
exports.barberQrRouter.post('/checkin', (0, validate_1.validate)(qr_1.qrCheckinBodySchema), qrController_1.checkInQrHandler);
/**
 * Admin QR tools — mounted at /api/admin/qr. The scanner can validate/inspect
 * any booking and check a customer in, but never mutates payment status: that
 * stays on the dedicated /api/admin/payments/:id/verify workflow.
 */
exports.adminQrRouter = (0, express_1.Router)();
exports.adminQrRouter.use(auth_1.requireAdmin);
exports.adminQrRouter.use(rateLimiter_1.qrScanLimiter);
exports.adminQrRouter.post('/validate', (0, validate_1.validate)(qr_1.qrValidateBodySchema), qrController_1.adminValidateQrHandler);
exports.adminQrRouter.post('/checkin', (0, validate_1.validate)(qr_1.qrCheckinBodySchema), qrController_1.adminCheckInQrHandler);
exports.adminQrRouter.get('/appointments/:id/history', (0, validate_1.validate)(qr_1.qrAppointmentIdParamsSchema, 'params'), qrController_1.appointmentQrHistoryHandler);
exports.adminQrRouter.get('/activity', (0, validate_1.validate)(qr_1.qrActivityQuerySchema, 'query'), qrController_1.listQrActivityHandler);
exports.adminQrRouter.post('/regenerate', (0, validate_1.validate)(qr_1.qrAppointmentBodySchema), qrController_1.regenerateQrHandler);
exports.adminQrRouter.post('/revoke', (0, validate_1.validate)(qr_1.qrAppointmentBodySchema), qrController_1.revokeQrHandler);
//# sourceMappingURL=qr.js.map