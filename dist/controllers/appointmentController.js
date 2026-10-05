"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppointmentHandler = createAppointmentHandler;
exports.listAppointmentsHandler = listAppointmentsHandler;
exports.getAppointmentByIdHandler = getAppointmentByIdHandler;
exports.updateAppointmentHandler = updateAppointmentHandler;
exports.updateAppointmentStatusHandler = updateAppointmentStatusHandler;
exports.reactivateAppointmentHandler = reactivateAppointmentHandler;
exports.deleteAppointmentHandler = deleteAppointmentHandler;
const appointmentService_1 = require("../services/appointmentService");
const response_1 = require("../utils/response");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
/** Multipart requests deliver every field as a string — passthrough unchanged; zod coerces. */
async function createAppointmentHandler(req, res, next) {
    try {
        const input = req.body;
        const receiptFile = req.file;
        const appointment = await (0, appointmentService_1.createAppointment)(input, receiptFile?.buffer ?? null, receiptFile?.mimetype);
        (0, response_1.successRes)(res, 'Your appointment request has been successfully submitted. We will contact you to confirm your appointment.', appointment, 201);
    }
    catch (error) {
        next(error);
    }
}
async function listAppointmentsHandler(req, res, next) {
    try {
        const query = req.query;
        const result = await (0, appointmentService_1.listAppointments)(query);
        (0, response_1.successRes)(res, 'Appointments retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function getAppointmentByIdHandler(req, res, next) {
    try {
        const appointment = await (0, appointmentService_1.getAppointmentById)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Appointment retrieved.', appointment, 200);
    }
    catch (error) {
        next(error);
    }
}
async function updateAppointmentHandler(req, res, next) {
    try {
        const input = req.body;
        const appointment = await (0, appointmentService_1.updateAppointment)(Number(req.params.id), input);
        (0, response_1.successRes)(res, 'Appointment updated successfully.', appointment, 200);
    }
    catch (error) {
        next(error);
    }
}
async function updateAppointmentStatusHandler(req, res, next) {
    try {
        const { status, cancellationReason } = req.body;
        const adminId = req.admin?.id;
        const appointment = await (0, appointmentService_1.updateAppointmentStatus)(Number(req.params.id), status, {
            cancellationReason: cancellationReason ?? null,
            cancelledBy: adminId ?? null,
            updatedByAdminId: adminId ?? null,
        });
        (0, response_1.successRes)(res, 'Appointment status updated successfully.', {
            ...appointment,
            availableNextSteps: (0, appointmentStatuses_1.getValidNextStatuses)(appointment.status),
        }, 200);
    }
    catch (error) {
        next(error);
    }
}
async function reactivateAppointmentHandler(req, res, next) {
    try {
        const appointment = await (0, appointmentService_1.reactivateAppointment)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Appointment reactivated successfully.', appointment, 200);
    }
    catch (error) {
        next(error);
    }
}
async function deleteAppointmentHandler(req, res, next) {
    try {
        await (0, appointmentService_1.deleteAppointment)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Appointment deleted successfully.', {}, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=appointmentController.js.map