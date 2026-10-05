"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardData = getDashboardData;
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
async function getDashboardData() {
    const [appointments, pending, confirmed, completed, cancelled, customers, barbers, services, pendingVerification, paid, rejected, revenueRow,] = await Promise.all([
        models_1.Appointment.count(),
        models_1.Appointment.count({
            where: { status: { [sequelize_1.Op.in]: appointmentStatuses_1.PENDING_STATUSES } },
        }),
        models_1.Appointment.count({
            where: { status: { [sequelize_1.Op.in]: appointmentStatuses_1.CONFIRMED_STATUSES } },
        }),
        models_1.Appointment.count({ where: { status: appointmentStatuses_1.AppointmentStatusValue.COMPLETED } }),
        models_1.Appointment.count({ where: { status: appointmentStatuses_1.AppointmentStatusValue.CANCELLED } }),
        models_1.Customer.count(),
        models_1.Barber.count(),
        models_1.Service.count({ where: { isActive: true } }),
        models_1.Payment.count({ where: { status: 'PENDING_VERIFICATION' } }),
        models_1.Payment.count({ where: { status: 'PAID' } }),
        models_1.Payment.count({ where: { status: 'REJECTED' } }),
        models_1.Payment.findOne({
            attributes: [[(0, sequelize_1.fn)('COALESCE', (0, sequelize_1.fn)('SUM', (0, sequelize_1.col)('amount')), 0), 'revenue']],
            where: { status: 'PAID' },
            raw: true,
        }),
    ]);
    const revenueRowValue = revenueRow?.revenue;
    const revenue = Number(revenueRowValue ?? 0);
    const recentRaw = await models_1.Appointment.findAll({
        order: [['createdAt', 'DESC']],
        limit: 8,
        include: [
            { model: models_1.Service, as: 'service', attributes: ['id', 'name'] },
            { model: models_1.Barber, as: 'barber', attributes: ['id', 'name'] },
        ],
    });
    return {
        totals: {
            appointments,
            pending,
            confirmed,
            completed,
            cancelled,
            customers,
            barbers,
            services,
        },
        payments: {
            pendingVerification,
            paid,
            rejected,
            revenue,
        },
        recentAppointments: recentRaw.map((appointment) => ({
            id: appointment.id,
            referenceCode: appointment.referenceCode,
            customerName: appointment.customerName,
            appointmentDate: appointment.appointmentDate,
            appointmentTime: appointment.appointmentTime,
            status: appointment.status,
            service: appointment.service
                ? { id: appointment.service.id, name: appointment.service.name }
                : null,
            barber: appointment.barber
                ? { id: appointment.barber.id, name: appointment.barber.name }
                : null,
        })),
    };
}
//# sourceMappingURL=dashboardService.js.map