"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardData = getDashboardData;
const database_1 = require("../config/database");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
async function getDashboardData() {
    const [appointments, pending, confirmed, completed, cancelled, customers, barbers, services, pendingVerification, paid, rejected, revenueAggregate, recentRaw,] = await Promise.all([
        database_1.prisma.appointment.count(),
        database_1.prisma.appointment.count({
            where: { status: { in: appointmentStatuses_1.PENDING_STATUSES } },
        }),
        database_1.prisma.appointment.count({
            where: { status: { in: appointmentStatuses_1.CONFIRMED_STATUSES } },
        }),
        database_1.prisma.appointment.count({ where: { status: appointmentStatuses_1.AppointmentStatusValue.COMPLETED } }),
        database_1.prisma.appointment.count({ where: { status: appointmentStatuses_1.AppointmentStatusValue.CANCELLED } }),
        database_1.prisma.customer.count(),
        database_1.prisma.barber.count(),
        database_1.prisma.service.count({ where: { isActive: true } }),
        database_1.prisma.payment.count({ where: { status: 'PENDING_VERIFICATION' } }),
        database_1.prisma.payment.count({ where: { status: 'PAID' } }),
        database_1.prisma.payment.count({ where: { status: 'REJECTED' } }),
        database_1.prisma.payment.aggregate({
            _sum: { amount: true },
            where: { status: 'PAID' },
        }),
        database_1.prisma.appointment.findMany({
            orderBy: { createdAt: 'desc' },
            take: 8,
            include: {
                service: { select: { id: true, name: true } },
                barber: { select: { id: true, name: true } },
            },
        }),
    ]);
    const revenue = Number(revenueAggregate._sum.amount ?? 0);
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