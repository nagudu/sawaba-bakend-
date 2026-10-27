"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssignmentHistory = getAssignmentHistory;
exports.assignBarber = assignBarber;
const database_1 = require("../config/database");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
const errors_1 = require("../utils/errors");
const appointmentService_1 = require("./appointmentService");
const commissionService_1 = require("./commissionService");
const availabilityService_1 = require("./availabilityService");
async function assertBarberAssignable(barberId, appointment) {
    const barber = await database_1.prisma.barber.findUnique({ where: { id: barberId } });
    if (!barber)
        throw new errors_1.NotFoundError('Selected barber not found.');
    if (!barber.isActive) {
        throw new errors_1.UnprocessableError(`${barber.name} is inactive and cannot take appointments.`);
    }
    const serviceLink = await database_1.prisma.barberService.findUnique({
        where: {
            barberId_serviceId: {
                barberId,
                serviceId: appointment.serviceId,
            },
        },
    });
    if (!serviceLink) {
        const service = await database_1.prisma.service.findUnique({
            where: { id: appointment.serviceId },
            select: { name: true },
        });
        throw new errors_1.UnprocessableError(`${barber.name} does not provide ${service?.name ?? 'this service'} and cannot be assigned.`);
    }
    const dayOfWeek = new Date(`${appointment.appointmentDate}T00:00:00`).getDay();
    const schedule = await database_1.prisma.barberAvailability.findMany({
        where: { barberId, dayOfWeek, isAvailable: true },
    });
    if (schedule.length > 0) {
        const startMin = (0, availabilityService_1.hhmmToMinutes)(appointment.appointmentTime);
        const service = await database_1.prisma.service.findUnique({
            where: { id: appointment.serviceId },
            select: { duration: true },
        });
        const endMin = startMin + (service?.duration ?? 30);
        const within = schedule.some((row) => startMin >= (0, availabilityService_1.hhmmToMinutes)(row.startTime) && endMin <= (0, availabilityService_1.hhmmToMinutes)(row.endTime));
        if (!within) {
            throw new errors_1.UnprocessableError(`${appointment.appointmentTime} is outside ${barber.name}'s working hours on ${appointment.appointmentDate}.`);
        }
    }
    const serviceRecord = await database_1.prisma.service.findUnique({
        where: { id: appointment.serviceId },
        select: { duration: true },
    });
    const duration = serviceRecord?.duration ?? 30;
    const startMin = (0, availabilityService_1.hhmmToMinutes)(appointment.appointmentTime);
    const endMin = startMin + duration;
    const sameDay = await database_1.prisma.appointment.findMany({
        where: {
            appointmentDate: appointment.appointmentDate,
            status: { not: appointmentStatuses_1.AppointmentStatusValue.CANCELLED },
            id: { not: appointment.id },
            OR: [{ barberId }, { assignedBarberId: barberId }],
        },
        include: { service: { select: { duration: true } } },
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
async function getAssignmentHistory(appointmentId) {
    const appointment = await database_1.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    const rows = await database_1.prisma.barberAssignmentHistory.findMany({
        where: { appointmentId },
        include: {
            previousBarber: { select: { id: true, name: true } },
            newBarber: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
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
    const appointment = await database_1.prisma.appointment.findUnique({ where: { id: appointmentId } });
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
    const next = input.barberId;
    if (next === effectiveCurrent) {
        return (0, appointmentService_1.getAppointmentById)(appointmentId);
    }
    const action = next === null ? 'REMOVED' : currentAssignment === null ? 'ASSIGNED' : 'REASSIGNED';
    await database_1.prisma.$transaction(async (tx) => {
        await tx.appointment.update({
            where: { id: appointmentId },
            data: {
                assignedBarberId: next,
                assignedAt: next ? new Date() : null,
                assignedBy: next ? adminId : null,
            },
        });
        await tx.barberAssignmentHistory.create({
            data: {
                appointmentId,
                previousBarberId: effectiveCurrent,
                newBarberId: next,
                action,
                reason: input.reason?.trim() || null,
                changedByAdminId: adminId,
            },
        });
        const earning = await tx.barberEarning.findUnique({ where: { appointmentId } });
        if (next !== null && (!earning || earning.status !== 'PAID')) {
            if (earning)
                await tx.barberEarning.delete({ where: { appointmentId } });
            await (0, commissionService_1.createEarningSnapshot)(appointmentId, next, Number(appointment.totalAmount), tx);
        }
        if (next !== null) {
            await tx.barberNotification.create({
                data: {
                    barberId: next,
                    type: 'ASSIGNMENT',
                    title: action === 'REASSIGNED' ? 'New appointment reassigned to you' : 'New appointment assigned to you',
                    message: `Appointment ${appointment.referenceCode ?? `#${appointmentId}`} (${appointment.appointmentDate} ${appointment.appointmentTime})${input.reason ? ` — reason: ${input.reason.trim()}` : ''}.`,
                },
            });
        }
    });
    return (0, appointmentService_1.getAppointmentById)(appointmentId);
}
//# sourceMappingURL=assignmentService.js.map