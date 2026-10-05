"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertBarberPortalAvailabilityHandler = exports.getBarberPortalAvailabilityHandler = exports.markBarberNotificationsReadHandler = exports.listBarberPortalNotificationsHandler = exports.listBarberPortalEarningsHandler = exports.updateBarberPortalAppointmentStatusHandler = exports.getBarberPortalAppointmentHandler = exports.listBarberPortalAppointmentsHandler = exports.getBarberPortalOverviewHandler = void 0;
const barberPortalService_1 = require("../services/barberPortalService");
const response_1 = require("../utils/response");
/** Wraps a service call so thrown errors reach the central error middleware. */
const handle = (run) => async (req, res, next) => {
    try {
        const { message, data, status = 200 } = await run(req);
        (0, response_1.successRes)(res, message, data, status);
    }
    catch (error) {
        next(error);
    }
};
exports.getBarberPortalOverviewHandler = handle(async (req) => ({
    message: 'Barber portal overview fetched.',
    data: { overview: await (0, barberPortalService_1.getBarberPortalOverview)(req.barber.id) },
}));
exports.listBarberPortalAppointmentsHandler = handle(async (req) => ({
    message: 'Barber appointments fetched.',
    data: await (0, barberPortalService_1.listBarberPortalAppointments)(req.barber.id, req.query),
}));
exports.getBarberPortalAppointmentHandler = handle(async (req) => ({
    message: 'Appointment fetched.',
    data: {
        appointment: await (0, barberPortalService_1.getBarberPortalAppointment)(req.barber.id, Number(req.params.appointmentId)),
    },
}));
exports.updateBarberPortalAppointmentStatusHandler = handle(async (req) => ({
    message: 'Appointment status updated.',
    data: {
        appointment: await (0, barberPortalService_1.updateBarberPortalAppointmentStatus)(req.barber.id, Number(req.params.appointmentId), req.body.to),
    },
}));
exports.listBarberPortalEarningsHandler = handle(async (req) => ({
    message: 'Barber earnings fetched.',
    data: await (0, barberPortalService_1.listBarberPortalEarnings)(req.barber.id, req.query),
}));
exports.listBarberPortalNotificationsHandler = handle(async (req) => ({
    message: 'Barber notifications fetched.',
    data: await (0, barberPortalService_1.listBarberPortalNotifications)(req.barber.id, req.query),
}));
exports.markBarberNotificationsReadHandler = handle(async (req) => {
    await (0, barberPortalService_1.markBarberPortalNotificationRead)(req.barber.id, req.body.notificationId);
    return { message: 'Notifications updated.' };
});
exports.getBarberPortalAvailabilityHandler = handle(async (req) => ({
    message: 'Barber availability fetched.',
    data: { availability: await (0, barberPortalService_1.getBarberPortalAvailability)(req.barber.id) },
}));
exports.upsertBarberPortalAvailabilityHandler = handle(async (req) => ({
    message: 'Barber availability saved.',
    data: { availability: await (0, barberPortalService_1.upsertBarberPortalAvailability)(req.barber.id, req.body) },
}));
//# sourceMappingURL=barberPortalController.js.map