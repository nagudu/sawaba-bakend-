"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryHandler = summaryHandler;
exports.appointmentsHandler = appointmentsHandler;
exports.paymentsHandler = paymentsHandler;
exports.cancelHandler = cancelHandler;
exports.appointmentByIdHandler = appointmentByIdHandler;
const customerMeService_1 = require("../services/customerMeService");
const response_1 = require("../utils/response");
async function summaryHandler(req, res, next) {
    try {
        const summary = await (0, customerMeService_1.getCustomerSummary)(req.customer);
        (0, response_1.successRes)(res, 'Dashboard summary retrieved.', summary, 200);
    }
    catch (error) {
        next(error);
    }
}
async function appointmentsHandler(req, res, next) {
    try {
        const result = await (0, customerMeService_1.getCustomerAppointments)(req.customer, {
            page: Number(req.query.page) || undefined,
            perPage: Number(req.query.perPage) || undefined,
        });
        (0, response_1.successRes)(res, 'Booking history retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function paymentsHandler(req, res, next) {
    try {
        const result = await (0, customerMeService_1.getCustomerPayments)(req.customer, {
            page: Number(req.query.page) || undefined,
            perPage: Number(req.query.perPage) || undefined,
        });
        (0, response_1.successRes)(res, 'Payment history retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function cancelHandler(req, res, next) {
    try {
        const { reason } = (req.body ?? {});
        const appointment = await (0, customerMeService_1.cancelOwnAppointment)(req.customer, Number(req.params.id), reason ?? null);
        (0, response_1.successRes)(res, 'Your appointment has been cancelled.', { appointment }, 200);
    }
    catch (error) {
        next(error);
    }
}
async function appointmentByIdHandler(req, res, next) {
    try {
        const appointment = await (0, customerMeService_1.getCustomerAppointmentById)(req.customer, Number(req.params.id));
        (0, response_1.successRes)(res, 'Appointment retrieved.', appointment, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=customerMeController.js.map