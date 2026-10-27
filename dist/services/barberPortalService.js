"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBarberPortalOverview = getBarberPortalOverview;
exports.listBarberPortalAppointments = listBarberPortalAppointments;
exports.getBarberPortalAppointment = getBarberPortalAppointment;
exports.updateBarberPortalAppointmentStatus = updateBarberPortalAppointmentStatus;
exports.listBarberPortalEarnings = listBarberPortalEarnings;
exports.listBarberPortalNotifications = listBarberPortalNotifications;
exports.markBarberPortalNotificationRead = markBarberPortalNotificationRead;
exports.getBarberPortalAvailability = getBarberPortalAvailability;
exports.upsertBarberPortalAvailability = upsertBarberPortalAvailability;
exports.toMinutes = toMinutes;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const appointmentService_1 = require("./appointmentService");
const commissionService_1 = require("./commissionService");
const barberService_1 = require("./barberService");
async function getBarberPortalOverview(barberId) {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekKey = weekStart.toISOString().slice(0, 10);
    const monthKey = todayKey.slice(0, 7);
    const [todayAppointments, upcoming, completed, pendingCount, earnings, barber, notifications, unreadCount] = await Promise.all([
        database_1.prisma.appointment.findMany({
            where: { barberId, appointmentDate: todayKey, status: { not: 'CANCELLED' } },
            include: {
                service: { select: { id: true, name: true, price: true, duration: true } },
                barber: { select: { id: true, name: true, image: true } },
            },
        }),
        database_1.prisma.appointment.findMany({
            where: {
                barberId,
                appointmentDate: { gt: todayKey },
                status: { not: 'CANCELLED' },
            },
        }),
        database_1.prisma.appointment.count({ where: { barberId, status: 'COMPLETED' } }),
        database_1.prisma.appointment.count({
            where: { barberId, status: { in: ['PAYMENT_VERIFIED', 'READY_FOR_SERVICE'] } },
        }),
        database_1.prisma.barberEarning.findMany({ where: { barberId } }),
        database_1.prisma.barber.findUnique({
            where: { id: barberId },
            select: { commissionType: true, commissionValue: true },
        }),
        database_1.prisma.barberNotification.findMany({
            where: { barberId },
            orderBy: { createdAt: 'desc' },
            take: 5,
        }),
        database_1.prisma.barberNotification.count({ where: { barberId, readAt: null } }),
    ]);
    const sum = (rows) => rows.reduce((total, e) => total + Number(e.commissionAmount), 0);
    const todayEarnings = sum(earnings.filter((e) => e.earnedAt && e.earnedAt.toISOString().slice(0, 10) === todayKey));
    const weekEarnings = sum(earnings.filter((e) => e.earnedAt && e.earnedAt.toISOString().slice(0, 10) >= weekKey));
    const monthEarnings = sum(earnings.filter((e) => e.earnedAt && e.earnedAt.toISOString().slice(0, 7) === monthKey));
    const dueSoon = todayAppointments
        .filter((a) => a.status === 'READY_FOR_SERVICE' || a.status === 'PAYMENT_VERIFIED')
        .sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime))
        .slice(0, 6)
        .map((a) => (0, appointmentService_1.serializeAppointment)(a));
    return {
        todayCount: todayAppointments.filter((a) => a.status !== 'IN_PROGRESS').length,
        daysUpcomingCount: upcoming.length,
        completedCount: completed,
        pendingCount,
        todayEarnings,
        weekEarnings,
        monthEarnings,
        totalEarnings: sum(earnings.filter((e) => e.status === 'EARNED' || e.status === 'PAID')),
        pendingCommission: sum(earnings.filter((e) => e.status === 'PENDING' || e.status === 'EARNED')),
        commissionType: barber?.commissionType ?? 'PERCENTAGE',
        commissionValue: Number(barber?.commissionValue ?? 0),
        unreadCount,
        dueSoon,
        notifications: notifications.map((n) => serializeNotification(n)),
    };
}
async function listBarberPortalAppointments(barberId, query) {
    const { offset, limit, page, perPage } = (0, response_1.getPagination)(query);
    const where = {
        OR: [{ barberId }, { assignedBarberId: barberId }],
    };
    if (query.status)
        where.status = query.status;
    if (query.from || query.to) {
        where.appointmentDate = {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
        };
    }
    const [rows, count] = await Promise.all([
        database_1.prisma.appointment.findMany({
            where,
            include: {
                service: { select: { id: true, name: true, price: true, duration: true } },
                barber: { select: { id: true, name: true, image: true } },
                assignedBarber: { select: { id: true, name: true, image: true } },
                payment: true,
            },
            orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
            skip: offset,
            take: limit,
        }),
        database_1.prisma.appointment.count({ where }),
    ]);
    return {
        items: rows.map((a) => (0, appointmentService_1.serializeAppointment)(a)),
        total: count,
        page,
        perPage,
    };
}
async function getBarberPortalAppointment(barberId, appointmentId) {
    const appointment = await database_1.prisma.appointment.findFirst({
        where: {
            id: appointmentId,
            OR: [{ barberId }, { assignedBarberId: barberId }],
        },
        include: {
            service: { select: { id: true, name: true, price: true, duration: true } },
            barber: { select: { id: true, name: true, image: true } },
            assignedBarber: { select: { id: true, name: true, image: true } },
            payment: true,
        },
    });
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found for this barber.');
    }
    return (0, appointmentService_1.serializeAppointment)(appointment);
}
async function updateBarberPortalAppointmentStatus(barberId, appointmentId, to) {
    const appointment = await database_1.prisma.appointment.findFirst({
        where: {
            id: appointmentId,
            OR: [{ barberId }, { assignedBarberId: barberId }],
        },
    });
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found for this barber.');
    }
    let updated;
    if (to === 'IN_PROGRESS') {
        if (appointment.status !== 'READY_FOR_SERVICE') {
            throw new errors_1.UnprocessableError('Only READY_FOR_SERVICE appointments can be started.');
        }
        updated = await database_1.prisma.appointment.update({
            where: { id: appointmentId },
            data: { status: 'IN_PROGRESS', serviceStartedAt: new Date() },
            include: {
                service: { select: { id: true, name: true, price: true, duration: true } },
                barber: { select: { id: true, name: true, image: true } },
                payment: true,
            },
        });
    }
    else {
        if (appointment.status !== 'IN_PROGRESS') {
            throw new errors_1.UnprocessableError('Only IN_PROGRESS appointments can be completed.');
        }
        updated = await database_1.prisma.appointment.update({
            where: { id: appointmentId },
            data: { status: 'COMPLETED', completedAt: new Date() },
            include: {
                service: { select: { id: true, name: true, price: true, duration: true } },
                barber: { select: { id: true, name: true, image: true } },
                payment: true,
            },
        });
    }
    await (0, commissionService_1.syncEarningForAppointment)(appointment.id);
    return (0, appointmentService_1.serializeAppointment)(updated);
}
async function listBarberPortalEarnings(barberId, query) {
    const { offset, limit, page, perPage } = (0, response_1.getPagination)(query);
    const where = { barberId };
    if (query.status)
        where.status = query.status;
    if (query.earningStatus)
        where.status = query.earningStatus;
    const [rows, count] = await Promise.all([
        database_1.prisma.barberEarning.findMany({
            where,
            include: {
                appointment: {
                    include: {
                        payment: { select: { status: true } },
                    },
                },
                barber: { select: { id: true, name: true, location: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
        }),
        database_1.prisma.barberEarning.count({ where }),
    ]);
    return {
        items: rows.map((e) => (0, commissionService_1.serializeEarning)(e)),
        total: count,
        page,
        perPage,
    };
}
async function listBarberPortalNotifications(barberId, query) {
    const { offset, limit, page, perPage } = (0, response_1.getPagination)(query);
    const [rows, count] = await Promise.all([
        database_1.prisma.barberNotification.findMany({
            where: { barberId },
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
        }),
        database_1.prisma.barberNotification.count({ where: { barberId } }),
    ]);
    return {
        items: rows.map((n) => serializeNotification(n)),
        unreadCount: await database_1.prisma.barberNotification.count({ where: { barberId, readAt: null } }),
        total: count,
        page,
        perPage,
    };
}
async function markBarberPortalNotificationRead(barberId, notificationId) {
    if (notificationId) {
        const target = await database_1.prisma.barberNotification.findFirst({
            where: { id: notificationId, barberId },
        });
        if (!target) {
            throw new errors_1.NotFoundError('Notification not found.');
        }
        await database_1.prisma.barberNotification.update({
            where: { id: notificationId },
            data: { readAt: new Date() },
        });
    }
    else {
        await database_1.prisma.barberNotification.updateMany({
            where: { barberId, readAt: null },
            data: { readAt: new Date() },
        });
    }
}
async function getBarberPortalAvailability(barberId) {
    return (0, barberService_1.getBarberAvailability)(barberId);
}
async function upsertBarberPortalAvailability(barberId, input) {
    const entries = Array.isArray(input) ? input : [input];
    return (0, barberService_1.upsertBarberAvailability)(barberId, entries);
}
function serializeNotification(notification) {
    return {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
    };
}
function toMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}
//# sourceMappingURL=barberPortalService.js.map