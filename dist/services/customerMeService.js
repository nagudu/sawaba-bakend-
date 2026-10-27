"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerSummary = getCustomerSummary;
exports.getCustomerAppointments = getCustomerAppointments;
exports.getCustomerPayments = getCustomerPayments;
exports.getCustomerAppointmentById = getCustomerAppointmentById;
exports.cancelOwnAppointment = cancelOwnAppointment;
exports.getBookingPrefill = getBookingPrefill;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const appointmentService_1 = require("./appointmentService");
const customerService_1 = require("./customerService");
const paymentService_1 = require("./paymentService");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
const CUSTOMER_CANCELLABLE = new Set([
    appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REQUIRED,
    appointmentStatuses_1.AppointmentStatusValue.PAYMENT_SUBMITTED,
    appointmentStatuses_1.AppointmentStatusValue.PAYMENT_VERIFIED,
    appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REJECTED,
    appointmentStatuses_1.AppointmentStatusValue.READY_FOR_SERVICE,
]);
function daysAgoLabel(date) {
    const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (diffDays <= 0)
        return 'today';
    if (diffDays === 1)
        return 'yesterday';
    if (diffDays < 30)
        return `${diffDays} days ago`;
    const months = Math.floor(diffDays / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
}
async function getCustomerSummary(customer) {
    const [appointments, stats] = await Promise.all([
        database_1.prisma.appointment.findMany({
            where: { customerId: customer.id },
            include: {
                service: { select: { id: true, name: true, price: true, duration: true } },
                barber: { select: { id: true, name: true, image: true } },
                assignedBarber: { select: { id: true, name: true, image: true } },
                payment: { select: { id: true, status: true, amount: true, paymentMethod: true, accessToken: true } },
            },
            orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
            take: 200,
        }),
        (0, customerService_1.getCustomerStats)(customer.id),
    ]);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const serialized = appointments.map(appointmentService_1.serializeAppointment);
    const upcoming = serialized
        .filter((a) => a.status !== 'COMPLETED' &&
        a.status !== 'CANCELLED' &&
        (a.appointmentDate > today ||
            (a.appointmentDate === today && a.appointmentTime >= now.toTimeString().slice(0, 5))))
        .sort((a, b) => a.appointmentDate === b.appointmentDate
        ? a.appointmentTime.localeCompare(b.appointmentTime)
        : a.appointmentDate.localeCompare(b.appointmentDate));
    const past = serialized.filter((a) => !upcoming.includes(a));
    const counts = new Map();
    for (const appointment of appointments) {
        const entry = counts.get(appointment.serviceId);
        if (entry) {
            entry.count += 1;
            if (appointment.appointmentDate > entry.last.appointmentDate)
                entry.last = appointment;
        }
        else {
            counts.set(appointment.serviceId, { count: 1, last: appointment });
        }
    }
    let usual = null;
    const favoriteId = customer.favoriteServiceId;
    if (favoriteId) {
        const fav = appointments.find((a) => a.serviceId === favoriteId);
        if (fav) {
            usual = {
                service: { id: fav.serviceId, name: fav.service?.name ?? 'Service', price: Number(fav.service?.price ?? 0) },
                timesBooked: counts.get(favoriteId)?.count ?? 1,
                lastBooked: daysAgoLabel(new Date(`${fav.appointmentDate}T12:00:00`)),
                appointmentId: fav.id,
                barberId: fav.barberId,
                isFavorite: true,
            };
        }
    }
    if (!usual && counts.size) {
        const [serviceId, entry] = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
        usual = {
            service: {
                id: serviceId,
                name: entry.last.service?.name ?? 'Service',
                price: Number(entry.last.service?.price ?? 0),
            },
            timesBooked: entry.count,
            lastBooked: daysAgoLabel(new Date(`${entry.last.appointmentDate}T12:00:00`)),
            appointmentId: entry.last.id,
            barberId: entry.last.barberId,
            isFavorite: false,
        };
    }
    return {
        customer: {
            id: customer.id,
            customerCode: customer.customerCode ?? `CUS-${String(customer.id).padStart(4, '0')}`,
            fullName: customer.fullName,
            phone: customer.phone,
            email: customer.email,
            avatarUrl: customer.avatarUrl,
            preferredBarberId: customer.preferredBarberId,
            favoriteServiceId: customer.favoriteServiceId,
            reminderOptIn: customer.reminderOptIn,
            createdAt: customer.createdAt,
        },
        stats,
        upcoming: upcoming.slice(0, 5),
        upcomingCount: upcoming.length,
        recent: past.slice(0, 6),
        usual,
    };
}
async function getCustomerAppointments(customer, query) {
    const page = Math.max(1, Number(query.page) || 1);
    const perPage = Math.min(50, Math.max(1, Number(query.perPage) || 20));
    const [rows, count] = await Promise.all([
        database_1.prisma.appointment.findMany({
            where: { customerId: customer.id },
            include: {
                service: { select: { id: true, name: true, price: true, duration: true } },
                barber: { select: { id: true, name: true, image: true } },
                assignedBarber: { select: { id: true, name: true, image: true } },
                payment: true,
            },
            orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
            skip: (page - 1) * perPage,
            take: perPage,
        }),
        database_1.prisma.appointment.count({ where: { customerId: customer.id } }),
    ]);
    return {
        items: rows.map(appointmentService_1.serializeAppointment),
        total: count,
        page,
        perPage,
    };
}
async function getCustomerPayments(customer, query) {
    const page = Math.max(1, Number(query.page) || 1);
    const perPage = Math.min(50, Math.max(1, Number(query.perPage) || 20));
    const [rows, count] = await Promise.all([
        database_1.prisma.payment.findMany({
            where: { customerId: customer.id },
            include: {
                appointment: {
                    select: {
                        id: true,
                        referenceCode: true,
                        customerName: true,
                        appointmentDate: true,
                        appointmentTime: true,
                        status: true,
                        service: { select: { id: true, name: true, price: true } },
                        barber: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * perPage,
            take: perPage,
        }),
        database_1.prisma.payment.count({ where: { customerId: customer.id } }),
    ]);
    return {
        items: rows.map((payment) => ({
            id: payment.id,
            appointmentId: payment.appointmentId,
            accessToken: payment.accessToken,
            referenceCode: payment.appointment?.referenceCode ?? null,
            customerName: payment.appointment?.customerName ?? customer.fullName,
            serviceName: payment.appointment?.service?.name ?? null,
            servicePrice: payment.appointment?.service ? Number(payment.appointment.service.price) : null,
            barberName: payment.appointment?.barber?.name ?? null,
            appointmentDate: payment.appointment?.appointmentDate ?? null,
            appointmentTime: payment.appointment?.appointmentTime ?? null,
            amount: Number(payment.amount),
            paymentMethod: payment.paymentMethod,
            transactionReference: payment.transactionReference,
            paymentDate: payment.paymentDate,
            status: payment.status,
            receiptUrl: payment.receiptUrl,
            verifiedAt: payment.verifiedAt,
            createdAt: payment.createdAt,
        })),
        total: count,
        page,
        perPage,
    };
}
async function getCustomerAppointmentById(customer, appointmentId) {
    const appointment = await database_1.prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
            service: { select: { id: true, name: true, price: true, duration: true } },
            barber: { select: { id: true, name: true, image: true } },
            assignedBarber: { select: { id: true, name: true, image: true } },
            payment: true,
        },
    });
    if (!appointment || appointment.customerId !== customer.id) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    return (0, appointmentService_1.serializeAppointment)(appointment);
}
async function cancelOwnAppointment(customer, appointmentId, reason) {
    const appointment = await database_1.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.customerId !== customer.id) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    if (!CUSTOMER_CANCELLABLE.has(appointment.status)) {
        throw new errors_1.UnprocessableError(appointment.status === 'COMPLETED'
            ? 'This appointment is already completed and cannot be cancelled.'
            : appointment.status === 'CANCELLED'
                ? 'This appointment is already cancelled.'
                : 'This appointment can no longer be cancelled online. Please call the salon.');
    }
    await database_1.prisma.appointment.update({
        where: { id: appointmentId },
        data: {
            status: appointmentStatuses_1.AppointmentStatusValue.CANCELLED,
            cancelledAt: new Date(),
            cancellationReason: reason ?? 'Cancelled by customer',
            cancelledBy: null,
        },
    });
    await (0, paymentService_1.markPaymentCancelled)(appointment.id);
    const fresh = await database_1.prisma.appointment.findUnique({
        where: { id: appointment.id },
        include: {
            service: { select: { id: true, name: true, price: true, duration: true } },
            barber: { select: { id: true, name: true, image: true } },
            payment: true,
        },
    });
    return (0, appointmentService_1.serializeAppointment)(fresh);
}
async function getBookingPrefill(customer) {
    const [lastAppointment, recentServicesRaw] = await Promise.all([
        database_1.prisma.appointment.findFirst({
            where: { customerId: customer.id },
            orderBy: { createdAt: 'desc' },
            include: {
                service: { select: { id: true, name: true, price: true, duration: true } },
                barber: { select: { id: true, name: true } },
            },
        }),
        database_1.prisma.appointment.findMany({
            where: { customerId: customer.id },
            select: { serviceId: true },
            distinct: ['serviceId'],
        }),
    ]);
    let usualService = null;
    let usualBarberId = null;
    if (lastAppointment?.service) {
        usualService = {
            id: lastAppointment.service.id,
            name: lastAppointment.service.name,
            price: Number(lastAppointment.service.price),
            duration: lastAppointment.service.duration,
        };
        usualBarberId = lastAppointment.barberId;
    }
    if (customer.favoriteServiceId && (!usualService || customer.favoriteServiceId !== usualService.id)) {
        const fav = await database_1.prisma.service.findUnique({ where: { id: customer.favoriteServiceId } });
        if (fav) {
            usualService = { id: fav.id, name: fav.name, price: Number(fav.price), duration: fav.duration };
        }
    }
    return {
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        usualService,
        usualBarberId,
        preferredBarberId: customer.preferredBarberId,
        recentServiceIds: recentServicesRaw.map((r) => r.serviceId),
    };
}
//# sourceMappingURL=customerMeService.js.map