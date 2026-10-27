"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeQrHandler = exports.regenerateQrHandler = exports.listQrActivityHandler = exports.appointmentQrHistoryHandler = exports.adminCheckInQrHandler = exports.adminValidateQrHandler = exports.getPublicBookingQrHandler = exports.getCustomerAppointmentQrHandler = exports.checkInQrHandler = exports.validateQrHandler = void 0;
const qrService_1 = require("../services/qrService");
const response_1 = require("../utils/response");
const handle = (run) => async (req, res, next) => {
    try {
        const { message, data, status = 200 } = await run(req);
        (0, response_1.successRes)(res, message, data, status);
    }
    catch (error) {
        next(error);
    }
};
function scanMeta(req, source = 'QR') {
    return {
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        source,
    };
}
// ─── Barber scanner ───────────────────────────────────────────────────────────
exports.validateQrHandler = handle(async (req) => {
    const { token, reference } = req.body;
    const result = await (0, qrService_1.validateQrScan)(req.barber.id, { token: token ?? null, reference: reference ?? null }, scanMeta(req, token ? 'QR' : 'MANUAL'));
    return { message: result.message, data: { result } };
});
exports.checkInQrHandler = handle(async (req) => {
    const { appointmentId, token } = req.body;
    const result = await (0, qrService_1.checkInAppointment)(req.barber.id, appointmentId, { token: token ?? null }, scanMeta(req, 'MANUAL'));
    return { message: result.message, data: { result } };
});
// ─── Customer ─────────────────────────────────────────────────────────────────
exports.getCustomerAppointmentQrHandler = handle(async (req) => ({
    message: 'Booking QR code fetched.',
    data: await (0, qrService_1.getCustomerAppointmentQr)(req.customer.id, Number(req.params.id)),
}));
// ─── Public (guest) ───────────────────────────────────────────────────────────
exports.getPublicBookingQrHandler = handle(async (req) => {
    const { reference, phone } = req.body;
    return {
        message: 'Booking QR code fetched.',
        data: await (0, qrService_1.getPublicBookingQr)({ reference, phone }),
    };
});
// ─── Admin ────────────────────────────────────────────────────────────────────
exports.adminValidateQrHandler = handle(async (req) => {
    const { token, reference } = req.body;
    const result = await (0, qrService_1.validateQrScanAsAdmin)(req.admin.id, { token: token ?? null, reference: reference ?? null }, scanMeta(req, token ? 'QR' : 'MANUAL'));
    return { message: result.message, data: { result } };
});
exports.adminCheckInQrHandler = handle(async (req) => {
    const { appointmentId, token } = req.body;
    const result = await (0, qrService_1.checkInAppointmentAsAdmin)(req.admin.id, appointmentId, { token: token ?? null }, scanMeta(req, 'MANUAL'));
    return { message: result.message, data: { result } };
});
exports.appointmentQrHistoryHandler = handle(async (req) => ({
    message: 'Check-in history fetched.',
    data: await (0, qrService_1.listAppointmentQrHistory)(Number(req.params.id)),
}));
exports.listQrActivityHandler = handle(async (req) => {
    const [activity, stats] = await Promise.all([
        (0, qrService_1.listQrActivity)(req.query),
        (0, qrService_1.getQrActivityStats)(),
    ]);
    return { message: 'QR scan activity fetched.', data: { ...activity, stats } };
});
exports.regenerateQrHandler = handle(async (req) => {
    const { appointmentId } = req.body;
    const data = await (0, qrService_1.adminRegenerateQr)(appointmentId, req.admin.id, scanMeta(req, 'ADMIN'));
    return { message: 'New QR code generated. The previous code no longer works.', data };
});
exports.revokeQrHandler = handle(async (req) => {
    const { appointmentId } = req.body;
    await (0, qrService_1.revokeQrByAdmin)(appointmentId, req.admin.id, scanMeta(req, 'ADMIN'));
    return { message: 'QR code revoked.', data: { appointmentId } };
});
//# sourceMappingURL=qrController.js.map