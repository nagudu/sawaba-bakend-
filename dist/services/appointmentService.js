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
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const availabilityService_1 = require("./availabilityService");
const customerService_1 = require("./customerService");
const paymentService_1 = require("./paymentService");
const qrService_1 = require("./qrService");
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
    const key = dateKey(appointmentDate);
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const dayCount = await database_1.prisma.appointment.count({ where: { appointmentDate } });
        const candidate = `APT-${key}-${String(dayCount + 1 + attempt).padStart(3, '0')}`;
        const taken = await database_1.prisma.appointment.findUnique({ where: { referenceCode: candidate } });
        if (!taken)
            return candidate;
    }
    const salt = node_crypto_1.default.randomBytes(2).toString('hex').toUpperCase();
    return `APT-${key}-${salt}`;
}
const customerAppointmentInclude = {
    service: { select: { id: true, name: true, price: true, duration: true } },
    barber: { select: { id: true, name: true, image: true } },
    assignedBarber: { select: { id: true, name: true, image: true } },
    payment: { select: { id: true, status: true, amount: true, paymentMethod: true, accessToken: true } },
};
exports.adminAppointmentInclude = {
    service: { select: { id: true, name: true, price: true, duration: true } },
    barber: { select: { id: true, name: true, image: true, barberType: true, location: true } },
    assignedBarber: { select: { id: true, name: true, image: true, barberType: true, location: true } },
    payment: { select: { id: true, status: true, amount: true, paymentMethod: true, accessToken: true } },
    earning: true,
};
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
    // Customer-safe assigned-barber info (#15): name/image only
    if (appointment.assignedBarber) {
        base.assignedBarberId = appointment.assignedBarber.id;
        base.assignedBarber = {
            id: appointment.assignedBarber.id,
            name: appointment.assignedBarber.name,
            image: appointment.assignedBarber.image,
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
            accessToken: appointment.payment.accessToken,
        };
    }
    return base;
}
/** Admin view — adds customer location, assignment data and the commission breakdown */
function serializeAppointmentForAdmin(appointment) {
    const base = serializeAppointment(appointment);
    base.customerLocation = appointment.customerLocation ?? null;
    base.assignedBarberId = appointment.assignedBarberId ?? null;
    base.assignedAt = appointment.assignedAt ?? null;
    if (appointment.assignedBarber) {
        base.assignedBarber = {
            id: appointment.assignedBarber.id,
            name: appointment.assignedBarber.name,
            image: appointment.assignedBarber.image,
            barberType: appointment.assignedBarber.barberType ?? 'INTERNAL',
            location: appointment.assignedBarber.location ?? null,
        };
    }
    if (appointment.earning) {
        base.earning = {
            commissionType: appointment.earning.commissionType,
            commissionRateSnapshot: Number(appointment.earning.commissionRateSnapshot),
            serviceAmount: Number(appointment.earning.serviceAmount),
            commissionAmount: Number(appointment.earning.commissionAmount),
            studioAmount: Number(appointment.earning.studioAmount),
            status: appointment.earning.status,
        };
    }
    return base;
}
async function assertBookableSlot(barberId, serviceId, date, time, excludeAppointmentId) {
    const barber = await database_1.prisma.barber.findUnique({ where: { id: barberId } });
    if (!barber || !barber.isActive) {
        throw new errors_1.UnprocessableError('The selected barber is not available.');
    }
    let serviceDuration = 0;
    let servicePrice = 0;
    if (serviceId !== null) {
        const service = await database_1.prisma.service.findUnique({ where: { id: serviceId } });
        if (!service || !service.isActive) {
            throw new errors_1.UnprocessableError('The selected service is not available.');
        }
        serviceDuration = service.duration;
        servicePrice = Number(service.price);
        const providerLink = await database_1.prisma.barberService.findFirst({ where: { barberId, serviceId } });
        const hasAnyServices = await database_1.prisma.barberService.findFirst({ where: { barberId } });
        if (hasAnyServices && !providerLink) {
            throw new errors_1.UnprocessableError('This barber does not provide the selected service.');
        }
    }
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    const hasAnyAvailability = await database_1.prisma.barberAvailability.findFirst({ where: { barberId } });
    if (hasAnyAvailability) {
        const availability = await database_1.prisma.barberAvailability.findFirst({
            where: { barberId, dayOfWeek, isAvailable: true },
        });
        if (!availability) {
            throw new errors_1.UnprocessableError('The barber is not available on the requested day.');
        }
        if (time < availability.startTime || time >= availability.endTime) {
            throw new errors_1.UnprocessableError('The requested time is outside the barber working hours.');
        }
    }
    const todayISO = new Date().toISOString().slice(0, 10);
    if (date < todayISO) {
        throw new errors_1.UnprocessableError('Appointments cannot be booked in the past.');
    }
    const start = (0, availabilityService_1.hhmmToMinutes)(time);
    const existing = await database_1.prisma.appointment.findMany({
        where: {
            barberId,
            appointmentDate: date,
            status: { not: appointmentStatuses_1.AppointmentStatusValue.CANCELLED },
            ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        },
    });
    const serviceIds = [...new Set(existing.map((a) => a.serviceId))];
    const services = await database_1.prisma.service.findMany({ where: { id: { in: serviceIds } } });
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
    const paymentMethod = input.paymentMethod;
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    const enabled = (settings.enabledPaymentMethods ?? []);
    const isCash = paymentMethod === 'CASH';
    const isOnline = paymentMethod === 'ONLINE';
    if (isOnline) {
        if (!process.env.PAYSTACK_SECRET_KEY) {
            throw new errors_1.UnprocessableError('Online payment is not available right now. Please choose another payment method.');
        }
    }
    else if (enabled.length > 0 && !enabled.includes(paymentMethod)) {
        throw new errors_1.UnprocessableError('This payment method is not currently accepted. Please choose another method.');
    }
    if (!isCash && !isOnline && !receiptBuffer) {
        throw new errors_1.UnprocessableError('Payment receipt is required before you can submit your appointment. Please upload your transfer receipt.');
    }
    const { servicePrice } = await assertBookableSlot(input.barberId, input.serviceId, input.appointmentDate, input.appointmentTime);
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
    const referenceCode = await generateReferenceCode(input.appointmentDate);
    const appointment = await database_1.prisma.appointment.create({
        data: {
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
            status: !isCash && !isOnline ? appointmentStatuses_1.AppointmentStatusValue.PAYMENT_SUBMITTED : appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REQUIRED,
            referenceCode,
        },
    });
    const payment = await database_1.prisma.payment.create({
        data: {
            appointmentId: appointment.id,
            customerId: customer.id,
            amount: servicePrice,
            paymentMethod: paymentMethod,
            transactionReference: input.transactionReference || null,
            paymentDate: isCash || isOnline ? null : new Date().toISOString().slice(0, 10),
            receiptUrl,
            receiptPublicId,
            note: null,
            status: isCash || isOnline ? 'UNPAID' : 'PENDING_VERIFICATION',
            accessToken: generatePaymentToken(),
        },
    });
    // Every booking gets its own revocable check-in QR token up front, so the
    // customer can reopen it later from the saved booking (never frontend state).
    await (0, qrService_1.ensureAppointmentQrToken)(appointment.id);
    // Commission snapshot (requirement #9) — frozen at booking time.
    await (0, commissionService_1.createEarningSnapshot)(appointment.id, input.barberId, servicePrice);
    const fresh = await database_1.prisma.appointment.findUnique({
        where: { id: appointment.id },
        include: customerAppointmentInclude,
    });
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
        ...(query.customerLocation ? { customerLocation: { contains: query.customerLocation } } : {}),
        ...(query.from || query.to
            ? {
                appointmentDate: {
                    ...(query.from ? { gte: query.from } : {}),
                    ...(query.to ? { lte: query.to } : {}),
                },
            }
            : {}),
    };
    if (query.search?.trim()) {
        const search = query.search.trim();
        where.OR = [
            { referenceCode: { contains: search } },
            { customerName: { contains: search } },
            { customerPhone: { contains: search } },
            { customerEmail: { contains: search } },
        ];
    }
    const [rows, total] = await Promise.all([
        database_1.prisma.appointment.findMany({
            where,
            include: exports.adminAppointmentInclude,
            orderBy: [
                { appointmentDate: 'desc' },
                { appointmentTime: 'desc' },
            ],
            skip: offset,
            take: limit,
        }),
        database_1.prisma.appointment.count({ where }),
    ]);
    return {
        items: rows.map(serializeAppointmentForAdmin),
        total,
        page,
        perPage,
    };
}
async function getAppointmentById(id) {
    const appointment = await database_1.prisma.appointment.findUnique({
        where: { id },
        include: exports.adminAppointmentInclude,
    });
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    return serializeAppointmentForAdmin(appointment);
}
async function updateAppointment(id, input) {
    const appointment = await database_1.prisma.appointment.findUnique({ where: { id } });
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
    await database_1.prisma.appointment.update({
        where: { id },
        data: input,
    });
    return getAppointmentById(id);
}
const VALID_STATUSES = appointmentStatuses_1.APPOINTMENT_STATUSES;
async function syncPaymentForStatus(appointmentId, status, adminId) {
    const payment = await database_1.prisma.payment.findUnique({ where: { appointmentId } });
    if (!payment)
        return;
    if (status === appointmentStatuses_1.AppointmentStatusValue.PAYMENT_VERIFIED && payment.status !== 'PAID') {
        await database_1.prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'PAID',
                verifiedAt: new Date(),
                verifiedBy: adminId ?? null,
                rejectionReason: null,
            },
        });
    }
    else if (status === appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REJECTED &&
        (payment.status === 'PENDING_VERIFICATION' || payment.status === 'UNPAID')) {
        await database_1.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'REJECTED', verifiedAt: null },
        });
    }
    else if (status === appointmentStatuses_1.AppointmentStatusValue.PAYMENT_SUBMITTED &&
        payment.status !== 'PENDING_VERIFICATION' &&
        payment.status !== 'PAID') {
        await database_1.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'PENDING_VERIFICATION', rejectionReason: null },
        });
    }
    else if (appointmentStatuses_1.PAID_GATED_STATUSES.includes(status) &&
        payment.status === 'UNPAID') {
        await database_1.prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'PAID',
                verifiedAt: new Date(),
                verifiedBy: adminId ?? null,
                rejectionReason: null,
            },
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
    const appointment = await database_1.prisma.appointment.findUnique({ where: { id } });
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
        const payment = await database_1.prisma.payment.findUnique({ where: { appointmentId: id } });
        if (payment && (payment.status === 'REJECTED' || payment.status === 'CANCELLED')) {
            throw new errors_1.UnprocessableError(`This payment was ${payment.status.toLowerCase()}, not verified. Verify the payment first (Payments page) or have the customer resubmit it before marking the appointment Ready for Service.`);
        }
    }
    const fields = {
        status,
        ...statusFieldsFor(status),
    };
    if (status === appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        fields.cancellationReason = options.cancellationReason ?? null;
        fields.cancelledBy = options.cancelledBy ?? null;
    }
    await database_1.prisma.appointment.update({
        where: { id },
        data: fields,
    });
    if (status === appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        await (0, paymentService_1.markPaymentCancelled)(id);
        await (0, qrService_1.revokeAppointmentQr)(id);
        await (0, commissionService_1.syncEarningForAppointment)(id);
    }
    else {
        await syncPaymentForStatus(id, status, options.updatedByAdminId);
        await (0, commissionService_1.syncEarningForAppointment)(id);
    }
    return getAppointmentById(id);
}
async function reactivateAppointment(id) {
    const appointment = await database_1.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    if (appointment.status !== appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        return getAppointmentById(id);
    }
    const payment = await database_1.prisma.payment.findUnique({ where: { appointmentId: id } });
    const nextStatus = payment?.status === 'PAID'
        ? appointmentStatuses_1.AppointmentStatusValue.READY_FOR_SERVICE
        : appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REQUIRED;
    await database_1.prisma.appointment.update({
        where: { id },
        data: {
            status: nextStatus,
            cancelledAt: null,
            cancellationReason: null,
            cancelledBy: null,
        },
    });
    if (payment && payment.status === 'CANCELLED') {
        await database_1.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'UNPAID' },
        });
    }
    return getAppointmentById(id);
}
async function deleteAppointment(id) {
    const appointment = await database_1.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) {
        throw new errors_1.NotFoundError('Appointment not found.');
    }
    await database_1.prisma.appointment.delete({ where: { id } });
}
//# sourceMappingURL=appointmentService.js.map