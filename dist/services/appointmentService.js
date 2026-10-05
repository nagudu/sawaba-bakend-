"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAppointmentInclude = void 0;
exports.serializeAppointment = serializeAppointment;
exports.serializeAppointmentForAdmin = serializeAppointmentForAdmin;
exports.createAppointment = createAppointment;
exports.listAppointments = listAppointments;
exports.getAppointmentById = getAppointmentById;
exports.updateAppointment = updateAppointment;
exports.updateAppointmentStatus = updateAppointmentStatus;
exports.reactivateAppointment = reactivateAppointment;
exports.deleteAppointment = deleteAppointment;
const node_crypto_1 = __importDefault(require("node:crypto"));
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const availabilityService_1 = require("./availabilityService");
const customerService_1 = require("./customerService");
const paymentService_1 = require("./paymentService");
const commissionService_1 = require("./commissionService");
const upload_1 = require("../utils/upload");
const paymentSettingsService_1 = require("./paymentSettingsService");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
function generatePaymentToken() {
    return node_crypto_1.default.randomBytes(24).toString('hex');
}
function dateKey(date) {
    return date.replace(/-/g, '');
}
async function generateReferenceCode(appointmentDate) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const key = dateKey(appointmentDate);
        const dayCount = await models_1.Appointment.count({ where: { appointmentDate } });
        const candidate = `APT-${key}-${String(dayCount + 1 + attempt).padStart(3, '0')}`;
        const taken = await models_1.Appointment.findOne({ where: { referenceCode: candidate } });
        if (!taken)
            return candidate;
    }
    const key = dateKey(appointmentDate);
    const salt = node_crypto_1.default.randomBytes(2).toString('hex').toUpperCase();
    return `APT-${key}-${salt}`;
}
const includeRelations = [
    {
        model: models_1.Service,
        as: 'service',
        attributes: ['id', 'name', 'price', 'duration'],
    },
    {
        model: models_1.Barber,
        as: 'barber',
        attributes: ['id', 'name', 'image'],
    },
    {
        model: models_1.Payment,
        as: 'payment',
        attributes: ['id', 'status', 'amount', 'paymentMethod', 'accessToken'],
    },
];
function serializeAppointment(appointment) {
    const base = {
        id: appointment.id,
        referenceCode: appointment.referenceCode,
        customerName: appointment.customerName,
        customerPhone: appointment.customerPhone,
        customerEmail: appointment.customerEmail,
        customerId: appointment.customerId,
        serviceId: appointment.serviceId,
        barberId: appointment.barberId,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        totalAmount: Number(appointment.totalAmount),
        notes: appointment.notes,
        status: appointment.status,
        serviceStartedAt: appointment.serviceStartedAt,
        completedAt: appointment.completedAt,
        cancelledAt: appointment.cancelledAt,
        cancellationReason: appointment.cancellationReason,
        cancelledBy: appointment.cancelledBy,
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
    };
    // Customer-safe assigned-barber info (#15): name/image only — the type,
    // location and commission fields stay admin-exclusive.
    const customerAssignedBarber = appointment.assignedBarber;
    if (customerAssignedBarber) {
        base.assignedBarberId = customerAssignedBarber.id;
        base.assignedBarber = {
            id: customerAssignedBarber.id,
            name: customerAssignedBarber.name,
            image: customerAssignedBarber.image,
        };
    }
    if (appointment.service) {
        base.service = {
            id: appointment.service.id,
            name: appointment.service.name,
            price: Number(appointment.service.price),
            duration: appointment.service.duration,
        };
    }
    if (appointment.barber) {
        base.barber = {
            id: appointment.barber.id,
            name: appointment.barber.name,
            image: appointment.barber.image,
        };
    }
    if (appointment.payment) {
        base.payment = {
            id: appointment.payment.id,
            status: appointment.payment.status,
            amount: Number(appointment.payment.amount),
            paymentMethod: appointment.payment.paymentMethod,
            // Capability token for the customer's own payment/receipt pages — the
            // dashboard needs it to build Pay Now / receipt links.
            accessToken: appointment.payment.accessToken,
        };
    }
    return base;
}
/**
 * Admin view — adds customer location, assignment data and the commission
 * breakdown (requirement #13). NEVER used for customer-facing responses.
 */
function serializeAppointmentForAdmin(appointment) {
    const base = serializeAppointment(appointment);
    base.customerLocation = appointment.customerLocation ?? null;
    base.assignedBarberId = appointment.assignedBarberId ?? null;
    base.assignedAt = appointment.assignedAt ?? null;
    if (appointment.assignedBarber) {
        const assigned = appointment.assignedBarber;
        base.assignedBarber = {
            id: assigned.id,
            name: assigned.name,
            image: assigned.image,
            barberType: assigned.barberType ?? 'INTERNAL',
            location: assigned.location ?? null,
        };
    }
    const earning = appointment.earning;
    if (earning) {
        base.earning = {
            commissionType: earning.commissionType,
            commissionRateSnapshot: Number(earning.commissionRateSnapshot),
            serviceAmount: Number(earning.serviceAmount),
            commissionAmount: Number(earning.commissionAmount),
            studioAmount: Number(earning.studioAmount),
            status: earning.status,
        };
    }
    return base;
}
/** Relation scope for the admin serializer (assignment + commission). */
exports.adminAppointmentInclude = [
    ...includeRelations,
    { model: models_1.Barber, as: 'assignedBarber', attributes: ['id', 'name', 'image', 'barberType', 'location'] },
    { model: models_1.BarberEarning, as: 'earning' },
];
async function assertBookableSlot(barberId, serviceId, date, time, excludeAppointmentId) {
    const barber = await models_1.Barber.findByPk(barberId);
    if (!barber || !barber.isActive) {
        throw new errors_1.UnprocessableError('The selected barber is not available.');
    }
    let serviceDuration = 0;
    let servicePrice = 0;
    if (serviceId !== null) {
        const service = await models_1.Service.findByPk(serviceId);
        if (!service || !service.isActive) {
            throw new errors_1.UnprocessableError('The selected service is not available.');
        }
        serviceDuration = service.duration;
        servicePrice = Number(service.price);
        const providerLink = await models_1.BarberService.findOne({ where: { barberId, serviceId } });
        const hasAnyServices = await models_1.BarberService.findOne({ where: { barberId } });
        // If the barber has at least one service assignment and this service is not
        // among them, reject. If the barber has NO assignments yet (admin hasn't
        // configured them), allow all services (single-salon fallback).
        if (hasAnyServices && !providerLink) {
            throw new errors_1.UnprocessableError('This barber does not provide the selected service.');
        }
    }
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    // Check if ANY availability rows exist for this barber at all.
    const hasAnyAvailability = await models_1.BarberAvailability.findOne({ where: { barberId } });
    if (hasAnyAvailability) {
        // Availability has been configured — enforce it strictly.
        const availability = await models_1.BarberAvailability.findOne({
            where: { barberId, dayOfWeek, isAvailable: true },
        });
        if (!availability) {
            throw new errors_1.UnprocessableError('The barber is not available on the requested day.');
        }
        if (time < availability.startTime || time >= availability.endTime) {
            throw new errors_1.UnprocessableError('The requested time is outside the barber working hours.');
        }
    }
    // If no availability rows exist yet (admin hasn't configured the schedule),
    // skip the availability check entirely. The barber is treated as available
    // every day during the salon's operating hours shown on the booking page.
    // Once the admin sets up a schedule, it will be enforced automatically.
    // Use date-only comparison for the "in the past" guard so that timezone
    // differences between client and server never reject a valid same-day slot.
    // Anything strictly before today's date is rejected; same-day slots are
    // always allowed (the customer can see them on the booking page).
    const todayISO = new Date().toISOString().slice(0, 10);
    if (date < todayISO) {
        throw new errors_1.UnprocessableError('Appointments cannot be booked in the past.');
    }
    const start = (0, availabilityService_1.hhmmToMinutes)(time);
    const existingQuery = {
        barberId,
        appointmentDate: date,
        status: { [sequelize_1.Op.ne]: appointmentStatuses_1.AppointmentStatusValue.CANCELLED },
    };
    const existing = excludeAppointmentId
        ? await models_1.Appointment.findAll({ where: { ...existingQuery, id: { [sequelize_1.Op.ne]: excludeAppointmentId } } })
        : await models_1.Appointment.findAll({ where: existingQuery });
    const serviceIds = [...new Set(existing.map((a) => a.serviceId))];
    const services = await models_1.Service.findAll({ where: { id: serviceIds } });
    const serviceMap = new Map(services.map((s) => [s.id, s.duration]));
    const end = start + serviceDuration;
    const conflict = existing.find((appointment) => {
        const existingStart = (0, availabilityService_1.hhmmToMinutes)(appointment.appointmentTime);
        const existingEnd = existingStart + (serviceMap.get(appointment.serviceId) ?? serviceDuration);
        return start < existingEnd && end > existingStart;
    });
    if (conflict) {
        throw new errors_1.ConflictError('This time slot is no longer available. Please choose another time.');
    }
    return { serviceDuration, servicePrice };
}
async function createAppointment(input, receiptBuffer = null, receiptMimetype = null) {
    // ── Payment rule enforcement (server-side authority) ────────────────────────
    // A malicious client cannot create a non-cash appointment without its payment
    // evidence: transfers must carry a receipt; online bookings are never created
    // up front (payment first, then the appointment via verified callback).
    const paymentMethod = input.paymentMethod;
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    const enabled = (settings.enabledPaymentMethods ?? []);
    const isCash = paymentMethod === 'CASH';
    const isOnline = paymentMethod === 'ONLINE';
    if (isOnline) {
        // Online bookings are created un-finalized (PAYMENT_REQUIRED + UNPAID) and
        // the customer is sent straight to Paystack checkout. The appointment only
        // becomes confirmed/ready after the backend verifies the transaction, so a
        // cancelled or failed payment never finalizes a booking.
        if (!process.env.PAYSTACK_SECRET_KEY) {
            throw new errors_1.UnprocessableError('Online payment is not available right now. Please choose another payment method.');
        }
    }
    else if (enabled.length > 0 && !enabled.includes(paymentMethod)) {
        throw new errors_1.UnprocessableError('This payment method is not currently accepted. Please choose another method.');
    }
    // Cash never needs a receipt; transfers/OPay MUST carry one — the customer
    // cannot create an unverifiable unpaid non-cash booking.
    if (!isCash && !isOnline && !receiptBuffer) {
        throw new errors_1.UnprocessableError('Payment receipt is required before you can submit your appointment. Please upload your transfer receipt.');
    }
    const { servicePrice } = await assertBookableSlot(input.barberId, input.serviceId, input.appointmentDate, input.appointmentTime);
    // Upload the receipt only after the slot checks pass so failed bookings never
    // leave orphan files on disk.
    let receiptUrl = null;
    let receiptPublicId = null;
    if (receiptBuffer) {
        const uploaded = await (0, upload_1.uploadImageToCloudinary)(receiptBuffer, 'sawaba-receipts', receiptMimetype ?? 'image/jpeg');
        receiptUrl = uploaded.url;
        receiptPublicId = uploaded.publicId;
    }
    const customer = await (0, customerService_1.findOrCreateCustomer)({
        fullName: input.customerName,
        phone: input.customerPhone,
        email: input.customerEmail ?? null,
    });
    const appointment = await models_1.Appointment.create({
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail ?? null,
        customerLocation: input.customerLocation ?? null,
        customerId: customer.id,
        serviceId: input.serviceId,
        barberId: input.barberId,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        totalAmount: servicePrice,
        notes: input.notes ?? null,
        status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REQUIRED,
        referenceCode: await generateReferenceCode(input.appointmentDate),
    });
    const payment = await models_1.Payment.create({
        appointmentId: appointment.id,
        customerId: customer.id,
        amount: servicePrice,
        // CASH → recorded immediately (admin later confirms receipt of money).
        // BANK_TRANSFER/OPAY/OTHER → receipt held, status PENDING_VERIFICATION so
        // it lands in the admin Payments queue for review.
        // ONLINE → UNPAID until Paystack's server-verified callback confirms it.
        paymentMethod,
        transactionReference: input.transactionReference || null,
        paymentDate: isCash || isOnline ? null : new Date().toISOString().slice(0, 10),
        receiptUrl,
        receiptPublicId,
        note: null,
        status: isCash || isOnline ? 'UNPAID' : 'PENDING_VERIFICATION',
        accessToken: generatePaymentToken(),
    });
    // Receipt-backed bookings behave exactly like a payment submitted from the
    // payment page: appointment moves to PAYMENT_SUBMITTED awaiting admin review.
    if (!isCash && !isOnline) {
        await appointment.update({ status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_SUBMITTED });
    }
    // Commission snapshot (requirement #9) — frozen at booking time.
    await (0, commissionService_1.createEarningSnapshot)(appointment.id, input.barberId, servicePrice);
    const fresh = await models_1.Appointment.findByPk(appointment.id, { include: includeRelations });
    return {
        appointment: serializeAppointment(fresh),
        payment: {
            id: payment.id,
            accessToken: payment.accessToken,
            amount: Number(payment.amount),
            status: payment.status,
        },
    };
}
async function listAppointments(query) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.barberId ? { barberId: query.barberId } : {}),
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        ...(query.customerLocation
            ? { customerLocation: { [sequelize_1.Op.like]: `%${query.customerLocation}%` } }
            : {}),
        ...(query.from || query.to
            ? {
                appointmentDate: {
                    ...(query.from ? { [sequelize_1.Op.gte]: query.from } : {}),
                    ...(query.to ? { [sequelize_1.Op.lte]: query.to } : {}),
                },
            }
            : {}),
        ...(query.search
            ? {
                [sequelize_1.Op.or]: [
                    { referenceCode: { [sequelize_1.Op.like]: `%${query.search}%` } },
                    { customerName: { [sequelize_1.Op.like]: `%${query.search}%` } },
                    { customerPhone: { [sequelize_1.Op.like]: `%${query.search}%` } },
                    { customerEmail: { [sequelize_1.Op.like]: `%${query.search}%` } },
                ],
            }
            : {}),
    };
    const { rows, count } = await models_1.Appointment.findAndCountAll({
        where,
        include: exports.adminAppointmentInclude,
        order: [
            ['appointmentDate', 'DESC'],
            ['appointmentTime', 'DESC'],
        ],
        offset,
        limit,
        distinct: true,
    });
    return {
        items: rows.map((row) => serializeAppointmentForAdmin(row)),
        total: count,
        page,
        perPage,
    };
}
async function getAppointmentById(id) {
    const appointment = await models_1.Appointment.findByPk(id, { include: exports.adminAppointmentInclude });
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    return serializeAppointmentForAdmin(appointment);
}
async function updateAppointment(id, input) {
    const appointment = await models_1.Appointment.findByPk(id);
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    if (input.appointmentDate || input.appointmentTime || input.barberId || input.serviceId) {
        const nextBarberId = input.barberId ?? appointment.barberId;
        const nextServiceId = input.serviceId ?? appointment.serviceId;
        const nextDate = input.appointmentDate ?? appointment.appointmentDate;
        const nextTime = input.appointmentTime ?? appointment.appointmentTime;
        await assertBookableSlot(nextBarberId, nextServiceId, nextDate, nextTime, id);
    }
    await appointment.update(input);
    return getAppointmentById(id);
}
const VALID_STATUSES = appointmentStatuses_1.APPOINTMENT_STATUSES;
/** Keeps the payment record aligned when an admin moves an appointment through the payment lifecycle. */
async function syncPaymentForStatus(appointmentId, status, adminId) {
    const payment = await models_1.Payment.findOne({ where: { appointmentId } });
    if (!payment)
        return;
    if (status === appointmentStatuses_1.AppointmentStatusValue.PAYMENT_VERIFIED && payment.status !== 'PAID') {
        await payment.update({
            status: 'PAID',
            verifiedAt: new Date(),
            verifiedBy: adminId ?? null,
            rejectionReason: null,
        });
    }
    else if (status === appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REJECTED &&
        (payment.status === 'PENDING_VERIFICATION' || payment.status === 'UNPAID')) {
        await payment.update({ status: 'REJECTED', verifiedAt: null });
    }
    else if (status === appointmentStatuses_1.AppointmentStatusValue.PAYMENT_SUBMITTED &&
        payment.status !== 'PENDING_VERIFICATION' &&
        payment.status !== 'PAID') {
        await payment.update({ status: 'PENDING_VERIFICATION', rejectionReason: null });
    }
    else if (appointmentStatuses_1.PAID_GATED_STATUSES.includes(status) &&
        payment.status === 'UNPAID') {
        // Legacy rows: the appointment was already marked PAYMENT_VERIFIED while its payment
        // record stayed UNPAID. Entering a service state attests the verification — repair it.
        await payment.update({
            status: 'PAID',
            verifiedAt: new Date(),
            verifiedBy: adminId ?? null,
            rejectionReason: null,
        });
    }
}
function statusFieldsFor(status) {
    const now = new Date();
    switch (status) {
        case appointmentStatuses_1.AppointmentStatusValue.IN_PROGRESS:
            return { serviceStartedAt: now };
        case appointmentStatuses_1.AppointmentStatusValue.COMPLETED:
            return { completedAt: now };
        case appointmentStatuses_1.AppointmentStatusValue.CANCELLED:
            return { cancelledAt: now };
        default:
            return {};
    }
}
async function updateAppointmentStatus(id, status, options = {}) {
    const appointment = await models_1.Appointment.findByPk(id);
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    const current = appointment.status;
    if (!VALID_STATUSES.includes(current)) {
        throw new errors_1.UnprocessableError(`This appointment has an invalid status "${current}". Please contact support.`);
    }
    if (current === appointmentStatuses_1.AppointmentStatusValue.CANCELLED && status !== appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        throw new errors_1.UnprocessableError('This appointment has been cancelled. Please reactivate it before changing its status.');
    }
    if (status === current) {
        return getAppointmentById(id);
    }
    if (!(0, appointmentStatuses_1.canTransition)(current, status)) {
        const suggestions = (0, appointmentStatuses_1.getValidNextStatuses)(current);
        const nextSteps = suggestions.length
            ? ` Available next steps: ${suggestions
                .map((next) => appointmentStatuses_1.APPOINTMENT_STATUS_LABELS[next])
                .join(', ')}.`
            : ' This appointment is in a terminal state and its status can no longer change.';
        throw new errors_1.UnprocessableError(`This appointment is currently ${appointmentStatuses_1.APPOINTMENT_STATUS_LABELS[current]} (${current}); it cannot move to ${appointmentStatuses_1.APPOINTMENT_STATUS_LABELS[status]}.${nextSteps}`);
    }
    if (appointmentStatuses_1.PAID_GATED_STATUSES.includes(status)) {
        const payment = await models_1.Payment.findOne({ where: { appointmentId: id } });
        if (payment && (payment.status === 'REJECTED' || payment.status === 'CANCELLED')) {
            throw new errors_1.UnprocessableError(`This payment was ${payment.status.toLowerCase()}, not verified. Verify the payment first (Payments page) or have the customer resubmit it before marking the appointment Ready for Service.`);
        }
        // No payment record, UNPAID or PAID all pass: the appointment's own PAYMENT_VERIFIED
        // status is the authority, and legacy UNPAID drift is repaired after the update.
    }
    const fields = {
        status,
        ...statusFieldsFor(status),
    };
    if (status === appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        fields.cancellationReason = options.cancellationReason ?? null;
        fields.cancelledBy = options.cancelledBy ?? null;
    }
    await appointment.update(fields);
    if (status === appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        await (0, paymentService_1.markPaymentCancelled)(id);
        // Commission must NEVER become earned on a cancelled booking (#19).
        await (0, commissionService_1.syncEarningForAppointment)(id);
    }
    else {
        await syncPaymentForStatus(id, status, options.updatedByAdminId);
        // EARNED requires payment PAID + appointment COMPLETED (#19) — evaluate
        // after the payment row has been synced.
        await (0, commissionService_1.syncEarningForAppointment)(id);
    }
    return getAppointmentById(id);
}
async function reactivateAppointment(id) {
    const appointment = await models_1.Appointment.findByPk(id);
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    if (appointment.status !== appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        return getAppointmentById(id);
    }
    const payment = await models_1.Payment.findOne({ where: { appointmentId: id } });
    const nextStatus = payment?.status === 'PAID'
        ? appointmentStatuses_1.AppointmentStatusValue.READY_FOR_SERVICE
        : appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REQUIRED;
    await appointment.update({
        status: nextStatus,
        cancelledAt: null,
        cancellationReason: null,
        cancelledBy: null,
    });
    if (payment && payment.status === 'CANCELLED') {
        await payment.update({ status: 'UNPAID' });
    }
    return getAppointmentById(id);
}
async function deleteAppointment(id) {
    const appointment = await models_1.Appointment.findByPk(id);
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    await appointment.destroy();
}
//# sourceMappingURL=appointmentService.js.map