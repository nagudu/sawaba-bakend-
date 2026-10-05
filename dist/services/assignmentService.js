"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssignmentHistory = getAssignmentHistory;
exports.assignBarber = assignBarber;
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const models_1 = require("../models");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
const errors_1 = require("../utils/errors");
const appointmentService_1 = require("./appointmentService");
const commissionService_1 = require("./commissionService");
const availabilityService_1 = require("./availabilityService");
/**
 * Pre-assignment eligibility checks (requirement: never double-book, never
 * assign an inactive/mismatched barber). Returns nothing — throws a
 * descriptive UnprocessableError explaining exactly why assignment must fail.
 */
async function assertBarberAssignable(barberId, appointment) {
    const barber = await models_1.Barber.findByPk(barberId);
    if (!barber)
        throw new errors_1.NotFoundError('Selected barber not found.');
    if (!barber.isActive) {
        throw new errors_1.UnprocessableError(`${barber.name} is inactive and cannot take appointments.`);
    }
    // The barber must actually provide the appointment's service.
    const serviceLink = await models_1.BarberService.findOne({
        where: { barberId, serviceId: appointment.serviceId },
    });
    if (!serviceLink) {
        const service = await models_1.Service.findByPk(appointment.serviceId, { attributes: ['name'] });
        throw new errors_1.UnprocessableError(`${barber.name} does not provide ${service?.name ?? 'this service'} and cannot be assigned.`);
    }
    // Working-hours check (only when the barber has a configured schedule).
    const dayOfWeek = new Date(`${appointment.appointmentDate}T00:00:00`).getDay();
    const schedule = await models_1.BarberAvailability.findAll({
        where: { barberId, dayOfWeek, isAvailable: true },
    });
    if (schedule.length > 0) {
        const startMin = (0, availabilityService_1.hhmmToMinutes)(appointment.appointmentTime);
        const service = await models_1.Service.findByPk(appointment.serviceId, { attributes: ['duration'] });
        const endMin = startMin + (service?.duration ?? 30);
        const within = schedule.some((row) => startMin >= (0, availabilityService_1.hhmmToMinutes)(row.startTime) && endMin <= (0, availabilityService_1.hhmmToMinutes)(row.endTime));
        if (!within) {
            throw new errors_1.UnprocessableError(`${appointment.appointmentTime} is outside ${barber.name}'s working hours on ${appointment.appointmentDate}.`);
        }
    }
    // Double-booking check against every non-cancelled appointment in the
    // target barber's calendar for that date — including appointments where
    // they are the ASSIGNED barber, not just the booked one.
    const duration = (await models_1.Service.findByPk(appointment.serviceId, { attributes: ['duration'] }))?.duration ?? 30;
    const startMin = (0, availabilityService_1.hhmmToMinutes)(appointment.appointmentTime);
    const endMin = startMin + duration;
    const sameDay = await models_1.Appointment.findAll({
        where: {
            appointmentDate: appointment.appointmentDate,
            status: { [sequelize_1.Op.ne]: appointmentStatuses_1.AppointmentStatusValue.CANCELLED },
            id: { [sequelize_1.Op.ne]: appointment.id },
            [sequelize_1.Op.or]: [{ barberId }, { assignedBarberId: barberId }],
        },
        include: [{ model: models_1.Service, as: 'service', attributes: ['duration'] }],
    });
    for (const other of sameDay) {
        const otherDuration = other.service?.duration ?? duration;
        const otherStart = (0, availabilityService_1.hhmmToMinutes)(other.appointmentTime);
        const otherEnd = otherStart + otherDuration;
        if (startMin < otherEnd && endMin > otherStart) {
            throw new errors_1.UnprocessableError(`${barber.name} is already booked at ${other.appointmentTime} on ${appointment.appointmentDate} (appointment ${other.referenceCode ?? `#${other.id}`}). Double-booking is not allowed.`);
        }
    }
}
/**
 * Admin barber assignment (requirement #5/#6).
 *
 * The customer's booked barber always stays on `barberId` — `assignedBarberId`
 * records the barber admin actually assigns. Admin has FINAL authority:
 * customers can never modify these fields (the customer-facing endpoints and
 * serializers never accept or expose them).
 */
async function getAssignmentHistory(appointmentId) {
    const appointment = await models_1.Appointment.findByPk(appointmentId);
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    const rows = await models_1.BarberAssignmentHistory.findAll({
        where: { appointmentId },
        include: [
            { model: models_1.Barber, as: 'previousBarber', attributes: ['id', 'name'] },
            { model: models_1.Barber, as: 'newBarber', attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'DESC']],
    });
    return rows.map((row) => ({
        id: row.id,
        action: row.action,
        previousBarber: row.previousBarber ? { id: row.previousBarber.id, name: row.previousBarber.name } : null,
        newBarber: row.newBarber ? { id: row.newBarber.id, name: row.newBarber.name } : null,
        reason: row.reason,
        createdAt: row.createdAt,
    }));
}
async function assignBarber(appointmentId, input, adminId) {
    const appointment = await models_1.Appointment.findByPk(appointmentId);
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    if (appointment.status === 'CANCELLED') {
        throw new errors_1.UnprocessableError('Cancelled bookings cannot be reassigned. Reactivate the booking first.');
    }
    if (input.barberId !== null) {
        await assertBarberAssignable(input.barberId, appointment);
    }
    const currentAssignment = appointment.assignedBarberId ?? null;
    const effectiveCurrent = currentAssignment ?? appointment.barberId;
    const next = input.barberId; // null = remove assignment (fall back to booked barber)
    if (next === effectiveCurrent) {
        // No-op — keep it idempotent.
        return (0, appointmentService_1.getAppointmentById)(appointmentId);
    }
    const action = next === null ? 'REMOVED' : currentAssignment === null ? 'ASSIGNED' : 'REASSIGNED';
    await database_1.sequelize.transaction(async (t) => {
        await appointment.update({
            assignedBarberId: next,
            assignedAt: next ? new Date() : null,
            assignedBy: next ? adminId : null,
        }, { transaction: t });
        await models_1.BarberAssignmentHistory.create({
            appointmentId,
            previousBarberId: effectiveCurrent,
            newBarberId: next,
            action,
            reason: input.reason?.trim() || null,
            changedByAdminId: adminId,
        }, { transaction: t });
        // The earning must follow the barber who will actually perform the work.
        // Re-snapshot with the NEW barber's CURRENT config; a PAID row is left
        // alone (money already settled against the old barber).
        const earning = await models_1.BarberEarning.findOne({ where: { appointmentId }, transaction: t });
        if (next !== null && (!earning || earning.status !== 'PAID')) {
            if (earning)
                await earning.destroy({ transaction: t });
            await (0, commissionService_1.createEarningSnapshot)(appointmentId, next, Number(appointment.totalAmount), t);
        }
        // Notify the target barber (in-app, barber portal).
        if (next !== null) {
            await models_1.BarberNotification.create({
                barberId: next,
                type: 'ASSIGNMENT',
                title: action === 'REASSIGNED' ? 'New appointment reassigned to you' : 'New appointment assigned to you',
                message: `Appointment ${appointment.referenceCode ?? `#${appointmentId}`} (${appointment.appointmentDate} ${appointment.appointmentTime})${input.reason ? ` — reason: ${input.reason.trim()}` : ''}.`,
            }, { transaction: t });
        }
    });
    return (0, appointmentService_1.getAppointmentById)(appointmentId);
}
//# sourceMappingURL=assignmentService.js.map