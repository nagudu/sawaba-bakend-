"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const appointmentService_1 = require("./appointmentService");
const commissionService_1 = require("./commissionService");
const barberService_1 = require("./barberService");
/**
 * Barber Portal — barber's OWN data. Every query is pinned to `barberId` from
 * the JWT (never client-supplied), and the return shapes reuse the existing
 * admin serializers so nothing new can leak another barber's data.
 */
async function getBarberPortalOverview(barberId) {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekKey = weekStart.toISOString().slice(0, 10);
    const monthKey = todayKey.slice(0, 7);
    const [todayAppointments, upcoming, completed, pendingCount, earnings, barber, notifications, unreadCount] = await Promise.all([
        models_1.Appointment.findAll({
            where: { barberId, appointmentDate: todayKey, status: { [sequelize_1.Op.not]: 'CANCELLED' } },
        }),
        models_1.Appointment.findAll({
            where: {
                barberId,
                appointmentDate: { [sequelize_1.Op.gt]: todayKey },
                status: { [sequelize_1.Op.not]: 'CANCELLED' },
            },
        }),
        models_1.Appointment.count({ where: { barberId, status: 'COMPLETED' } }),
        models_1.Appointment.count({
            where: { barberId, status: { [sequelize_1.Op.in]: ['PAYMENT_VERIFIED', 'READY_FOR_SERVICE'] } },
        }),
        models_1.BarberEarning.findAll({ where: { barberId } }),
        (await Promise.resolve().then(() => __importStar(require('../models')))).Barber.findByPk(barberId, { attributes: ['commissionType', 'commissionValue'] }),
        models_1.BarberNotification.findAll({
            where: { barberId },
            order: [['createdAt', 'DESC']],
            limit: 5,
        }),
        models_1.BarberNotification.count({ where: { barberId, readAt: null } }),
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
    // A barber works an appointment when they are the booked barber OR the
    // admin-assigned barber — assignments are the operative field for the
    // customer → admin → barber flow.
    const where = {
        [sequelize_1.Op.or]: [{ barberId }, { assignedBarberId: barberId }],
    };
    if (query.status)
        where.status = query.status;
    if (query.from || query.to) {
        where.appointmentDate = {
            ...(query.from ? { [sequelize_1.Op.gte]: query.from } : {}),
            ...(query.to ? { [sequelize_1.Op.lte]: query.to } : {}),
        };
    }
    const { rows, count } = await models_1.Appointment.findAndCountAll({
        where,
        include: [
            {
                model: (await Promise.resolve().then(() => __importStar(require('../models')))).Service,
                as: 'service',
                attributes: ['id', 'name', 'price', 'duration'],
            },
        ],
        order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
        offset,
        limit,
    });
    return {
        items: rows.map((a) => (0, appointmentService_1.serializeAppointment)(a)),
        total: count,
        page,
        perPage,
    };
}
async function getBarberPortalAppointment(barberId, appointmentId) {
    const appointment = await models_1.Appointment.findOne({
        where: {
            id: appointmentId,
            [sequelize_1.Op.or]: [{ barberId }, { assignedBarberId: barberId }],
        },
    });
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found for this barber.');
    }
    return (0, appointmentService_1.serializeAppointment)(appointment);
}
/** Barber marks their own appointment IN_PROGRESS → COMPLETED (their session). */
async function updateBarberPortalAppointmentStatus(barberId, appointmentId, to) {
    const appointment = await models_1.Appointment.findOne({
        where: {
            id: appointmentId,
            [sequelize_1.Op.or]: [{ barberId }, { assignedBarberId: barberId }],
        },
    });
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found for this barber.');
    }
    if (to === 'IN_PROGRESS') {
        if (appointment.status !== 'READY_FOR_SERVICE') {
            throw new errors_1.UnprocessableError('Only READY_FOR_SERVICE appointments can be started.');
        }
        await appointment.update({ status: 'IN_PROGRESS' });
    }
    else {
        if (appointment.status !== 'IN_PROGRESS') {
            throw new errors_1.UnprocessableError('Only IN_PROGRESS appointments can be completed.');
        }
        await appointment.update({ status: 'COMPLETED', completedAt: new Date() });
    }
    // Re-sync the earning ledger: a completed appointment with a PAID payment
    // becomes EARNED in the barber's ledger.
    await (0, commissionService_1.syncEarningForAppointment)(appointment.id);
    return (0, appointmentService_1.serializeAppointment)(appointment);
}
async function listBarberPortalEarnings(barberId, query) {
    const { offset, limit, page, perPage } = (0, response_1.getPagination)(query);
    const where = { barberId };
    if (query.status)
        where.status = query.status;
    if (query.earningStatus)
        where.status = query.earningStatus;
    const { rows, count } = await models_1.BarberEarning.findAndCountAll({
        where,
        include: [
            { model: models_1.Appointment, as: 'appointment', attributes: ['id', 'referenceCode', 'serviceId', 'totalAmount', 'appointmentDate'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit,
    });
    return {
        items: rows.map((e) => (0, commissionService_1.serializeEarning)(e)),
        total: count,
        page,
        perPage,
    };
}
async function listBarberPortalNotifications(barberId, query) {
    const { offset, limit, page, perPage } = (0, response_1.getPagination)(query);
    const { rows, count } = await models_1.BarberNotification.findAndCountAll({
        where: { barberId },
        order: [['createdAt', 'DESC']],
        offset,
        limit,
    });
    return {
        items: rows.map((n) => serializeNotification(n)),
        unreadCount: await models_1.BarberNotification.count({ where: { barberId, readAt: null } }),
        total: count,
        page,
        perPage,
    };
}
async function markBarberPortalNotificationRead(barberId, notificationId) {
    const where = { barberId };
    if (notificationId)
        where.id = notificationId;
    const target = notificationId
        ? await models_1.BarberNotification.findOne({ where })
        : null;
    if (notificationId && !target) {
        throw new errors_1.NotFoundError('Notification not found.');
    }
    if (notificationId) {
        await target.update({ readAt: new Date() });
    }
    else {
        await models_1.BarberNotification.update({ readAt: new Date() }, { where: { barberId, readAt: null } });
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
/** Converts a bare "HH:mm" clock into minutes past midnight for slot math. */
function toMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}
//# sourceMappingURL=barberPortalService.js.map