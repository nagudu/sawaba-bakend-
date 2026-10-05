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
exports.getCustomerSummary = getCustomerSummary;
exports.getCustomerAppointments = getCustomerAppointments;
exports.getCustomerPayments = getCustomerPayments;
exports.getCustomerAppointmentById = getCustomerAppointmentById;
exports.cancelOwnAppointment = cancelOwnAppointment;
exports.getBookingPrefill = getBookingPrefill;
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const appointmentService_1 = require("./appointmentService");
const customerService_1 = require("./customerService");
const paymentService_1 = require("./paymentService");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
/** Appointment statuses a customer may cancel themselves. */
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
/** Everything the customer dashboard needs in one call (always customer-scoped). */
async function getCustomerSummary(customer) {
    const [appointments, stats] = await Promise.all([
        models_1.Appointment.findAll({
            where: { customerId: customer.id },
            include: [
                { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
                { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber, as: 'barber', attributes: ['id', 'name', 'image'] },
                // Customer-safe assignment info (#15): name/image only.
                { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber, as: 'assignedBarber', attributes: ['id', 'name', 'image'] },
                { model: models_1.Payment, as: 'payment', attributes: ['id', 'status', 'amount', 'paymentMethod', 'accessToken'] },
            ],
            order: [
                ['appointmentDate', 'DESC'],
                ['appointmentTime', 'DESC'],
            ],
            limit: 200,
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
    // "Book Again": most frequent service across history (not forced — just a suggestion).
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
/** Full paginated booking history for the logged-in customer. */
async function getCustomerAppointments(customer, query) {
    const page = Math.max(1, Number(query.page) || 1);
    const perPage = Math.min(50, Math.max(1, Number(query.perPage) || 20));
    const { rows, count } = await models_1.Appointment.findAndCountAll({
        where: { customerId: customer.id },
        include: [
            { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
            { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber, as: 'barber', attributes: ['id', 'name', 'image'] },
            { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber, as: 'assignedBarber', attributes: ['id', 'name', 'image'] },
            { model: models_1.Payment, as: 'payment' },
        ],
        order: [
            ['appointmentDate', 'DESC'],
            ['appointmentTime', 'DESC'],
        ],
        offset: (page - 1) * perPage,
        limit: perPage,
    });
    return {
        items: rows.map(appointmentService_1.serializeAppointment),
        total: count,
        page,
        perPage,
    };
}
/** Payment history with receipt access — strictly scoped to this customer. */
async function getCustomerPayments(customer, query) {
    const page = Math.max(1, Number(query.page) || 1);
    const perPage = Math.min(50, Math.max(1, Number(query.perPage) || 20));
    const { rows, count } = await models_1.Payment.findAndCountAll({
        where: { customerId: customer.id },
        include: [
            {
                model: (await Promise.resolve().then(() => __importStar(require('../models')))).Appointment,
                as: 'appointment',
                attributes: ['id', 'referenceCode', 'customerName', 'appointmentDate', 'appointmentTime', 'status'],
                include: [
                    {
                        model: (await Promise.resolve().then(() => __importStar(require('../models')))).Service,
                        as: 'service',
                        attributes: ['id', 'name', 'price'],
                    },
                    {
                        model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber,
                        as: 'barber',
                        attributes: ['id', 'name'],
                    },
                ],
            },
        ],
        order: [['createdAt', 'DESC']],
        offset: (page - 1) * perPage,
        limit: perPage,
    });
    // accessToken IS included deliberately: it is the customer's own payment-
    // page key, letting them open /pay and /receipt pages for their records.
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
/** Single appointment detail — strictly scoped to the logged-in customer. */
async function getCustomerAppointmentById(customer, appointmentId) {
    const appointment = await models_1.Appointment.findByPk(appointmentId, {
        include: [
            {
                model: (await Promise.resolve().then(() => __importStar(require('../models')))).Service,
                as: 'service',
                attributes: ['id', 'name', 'price', 'duration'],
            },
            {
                model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber,
                as: 'barber',
                attributes: ['id', 'name', 'image'],
            },
            {
                model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber,
                as: 'assignedBarber',
                attributes: ['id', 'name', 'image'],
            },
            {
                model: models_1.Payment,
                as: 'payment',
                // Include the accessToken so the frontend can open /pay/:token directly.
                attributes: ['id', 'status', 'amount', 'paymentMethod', 'transactionReference',
                    'paymentDate', 'receiptUrl', 'rejectionReason', 'verifiedAt', 'accessToken'],
            },
        ],
    });
    // Return an identical 404 whether the appointment doesn't exist or belongs
    // to a different customer — prevents ID enumeration.
    if (!appointment || appointment.customerId !== customer.id) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    return (0, appointmentService_1.serializeAppointment)(appointment);
}
/** Customer cancels their own appointment — backend re-checks every rule. */
async function cancelOwnAppointment(customer, appointmentId, reason) {
    const appointment = await models_1.Appointment.findByPk(appointmentId);
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    if (appointment.customerId !== customer.id) {
        // Deliberately identical to "not found" so IDs cannot be probed.
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    if (!CUSTOMER_CANCELLABLE.has(appointment.status)) {
        throw new errors_1.UnprocessableError(appointment.status === 'COMPLETED'
            ? 'This appointment is already completed and cannot be cancelled.'
            : appointment.status === 'CANCELLED'
                ? 'This appointment is already cancelled.'
                : 'This appointment can no longer be cancelled online. Please call the salon.');
    }
    await appointment.update({
        status: appointmentStatuses_1.AppointmentStatusValue.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason ?? 'Cancelled by customer',
        cancelledBy: null,
    });
    await (0, paymentService_1.markPaymentCancelled)(appointment.id);
    const fresh = await models_1.Appointment.findByPk(appointment.id, {
        include: [
            { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
            { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber, as: 'barber', attributes: ['id', 'name', 'image'] },
            { model: models_1.Payment, as: 'payment', attributes: ['id', 'status', 'amount', 'paymentMethod', 'accessToken'] },
        ],
    });
    return (0, appointmentService_1.serializeAppointment)(fresh);
}
/**
 * Booking prefill for a logged-in customer: identity plus their usual
 * service/barber so the booking form starts 90% complete.
 */
async function getBookingPrefill(customer) {
    const [lastAppointment, recentServices] = await Promise.all([
        models_1.Appointment.findOne({
            where: { customerId: customer.id },
            order: [['createdAt', 'DESC']],
            include: [
                { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
                { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber, as: 'barber', attributes: ['id', 'name'] },
            ],
        }),
        models_1.Appointment.findAll({
            where: { customerId: customer.id },
            attributes: ['serviceId'],
            group: ['serviceId'],
            order: [],
            raw: true,
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
    // An explicit favorite overrides recency.
    if (customer.favoriteServiceId && (!usualService || customer.favoriteServiceId !== usualService.id)) {
        const fav = await models_1.Service.findByPk(customer.favoriteServiceId);
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
        recentServiceIds: recentServices.map((r) => Number(r.serviceId)),
    };
}
//# sourceMappingURL=customerMeService.js.map