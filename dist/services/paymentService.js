"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyProviderVerification = applyProviderVerification;
exports.getPaymentByAccessToken = getPaymentByAccessToken;
exports.getPublicPayment = getPublicPayment;
exports.submitPayment = submitPayment;
exports.declareCashPayment = declareCashPayment;
exports.trackPayment = trackPayment;
exports.listPayments = listPayments;
exports.getPaymentById = getPaymentById;
exports.verifyPayment = verifyPayment;
exports.confirmCashPayment = confirmCashPayment;
exports.rejectPayment = rejectPayment;
exports.markPaymentCancelled = markPaymentCancelled;
exports.getPaymentSummary = getPaymentSummary;
exports.markPaymentRefunded = markPaymentRefunded;
exports.exportPayments = exportPayments;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const upload_1 = require("../utils/upload");
const paymentSettingsService_1 = require("./paymentSettingsService");
const commissionService_1 = require("./commissionService");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
const paymentInclude = {
    appointment: {
        include: {
            service: true,
            barber: true,
        },
    },
};
/** Marks a payment PAID on provider/admin confirmation and advances the appointment. */
async function applyProviderVerification(appointmentId, info) {
    const payment = await database_1.prisma.payment.findUnique({ where: { appointmentId } });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment record not found for this appointment.');
    }
    const justPaid = payment.status !== 'PAID';
    if (justPaid) {
        await database_1.prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'PAID',
                verifiedBy: info?.adminId ?? null,
                verifiedAt: new Date(),
                rejectionReason: null,
                ...(info?.providerRef ? { providerRef: info.providerRef } : {}),
            },
        });
    }
    const appointment = await database_1.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (appointment && appointment.status !== appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        if (appointment.status !== appointmentStatuses_1.AppointmentStatusValue.PAYMENT_VERIFIED) {
            await database_1.prisma.appointment.update({
                where: { id: appointmentId },
                data: { status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_VERIFIED },
            });
        }
        // Auto-advance into service when valid; provider-confirmed payments may jump
        // straight from PAYMENT_REQUIRED because Paystack attested the money arrived.
        const canAutoAdvance = (0, appointmentStatuses_1.canTransition)(appointment.status, appointmentStatuses_1.AppointmentStatusValue.READY_FOR_SERVICE) ||
            appointment.status === appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REQUIRED;
        if (canAutoAdvance &&
            appointment.status !== appointmentStatuses_1.AppointmentStatusValue.READY_FOR_SERVICE &&
            appointment.status !== appointmentStatuses_1.AppointmentStatusValue.IN_PROGRESS &&
            appointment.status !== appointmentStatuses_1.AppointmentStatusValue.COMPLETED) {
            await database_1.prisma.appointment.update({
                where: { id: appointmentId },
                data: { status: appointmentStatuses_1.AppointmentStatusValue.READY_FOR_SERVICE },
            });
        }
    }
    // Money is now confirmed — re-evaluate the commission ledger (#19).
    await (0, commissionService_1.syncEarningForAppointment)(appointmentId);
    if (justPaid) {
        await notifyBarberPaymentVerified(appointmentId);
    }
    return getPublicPaymentByAppointmentId(appointmentId);
}
/**
 * Tells the assigned barber (falling back to the originally booked barber) that
 * the money for an appointment is confirmed. Best-effort: a notification failure
 * must never roll back a verified payment.
 */
async function notifyBarberPaymentVerified(appointmentId) {
    try {
        const appointment = await database_1.prisma.appointment.findUnique({
            where: { id: appointmentId },
            select: {
                referenceCode: true,
                appointmentDate: true,
                appointmentTime: true,
                assignedBarberId: true,
                barberId: true,
            },
        });
        if (!appointment)
            return;
        const barberId = appointment.assignedBarberId ?? appointment.barberId;
        if (!barberId)
            return;
        await database_1.prisma.barberNotification.create({
            data: {
                barberId,
                type: 'APPOINTMENT',
                title: 'Payment confirmed',
                message: `Payment for ${appointment.referenceCode ?? 'a booking'} on ${appointment.appointmentDate} at ${appointment.appointmentTime} has been verified. The customer is cleared for check-in.`,
            },
        });
    }
    catch {
        // best-effort only
    }
}
async function getPublicPaymentByAppointmentId(appointmentId) {
    const payment = await getPaymentByAppointmentId(appointmentId);
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    return { payment: serializePayment(payment), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
/** Finds a payment by its public access token (the /pay/:token URL). */
async function getPaymentByAccessToken(token) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { accessToken: token },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found. Check the link and try again.');
    }
    return payment;
}
function serializePayment(payment) {
    const base = {
        id: payment.id,
        appointmentId: payment.appointmentId,
        amount: Number(payment.amount),
        paymentMethod: payment.paymentMethod,
        transactionReference: payment.transactionReference,
        paymentDate: payment.paymentDate,
        receiptUrl: payment.receiptUrl,
        note: payment.note,
        status: payment.status,
        rejectionReason: payment.rejectionReason,
        verifiedAt: payment.verifiedAt,
        verifiedBy: payment.verifiedBy,
        providerRef: payment.providerRef,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        accessToken: payment.accessToken,
    };
    const appointment = payment.appointment;
    if (appointment) {
        base.appointment = {
            id: appointment.id,
            referenceCode: appointment.referenceCode,
            customerName: appointment.customerName,
            customerPhone: appointment.customerPhone,
            customerEmail: appointment.customerEmail,
            appointmentDate: appointment.appointmentDate,
            appointmentTime: appointment.appointmentTime,
            totalAmount: Number(appointment.totalAmount),
            status: appointment.status,
            service: appointment.service
                ? {
                    id: appointment.service.id,
                    name: appointment.service.name,
                    price: Number(appointment.service.price),
                    duration: appointment.service.duration,
                }
                : null,
            barber: appointment.barber
                ? { id: appointment.barber.id, name: appointment.barber.name, image: appointment.barber.image }
                : null,
        };
    }
    return base;
}
async function getPaymentByAppointmentId(appointmentId) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { appointmentId },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment record not found for this appointment.');
    }
    return payment;
}
async function getPublicPayment(token) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { accessToken: token },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found. Check the link and try again.');
    }
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    return { payment: serializePayment(payment), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
async function submitPayment(token, input, receiptBuffer) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { accessToken: token },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found. Check the link and try again.');
    }
    const appointment = payment.appointment;
    if (!appointment || appointment.status === appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        throw new errors_1.UnprocessableError('This appointment has been cancelled and cannot accept a payment.');
    }
    if (payment.status === 'PAID') {
        throw new errors_1.ConflictError('This appointment has already been paid and verified.');
    }
    if (payment.status === 'PENDING_VERIFICATION') {
        throw new errors_1.ConflictError('This payment has already been submitted and is under review. Please wait for our team to verify it.');
    }
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    const enabled = (settings.enabledPaymentMethods ?? []);
    if (enabled.length > 0 && !enabled.includes(input.paymentMethod)) {
        throw new errors_1.UnprocessableError('This payment method is not currently accepted. Please choose another method.');
    }
    const requiresReceipt = settings.receiptRequired && input.paymentMethod !== 'CASH';
    if (requiresReceipt && !receiptBuffer) {
        throw new errors_1.UnprocessableError('Please upload a payment receipt image.');
    }
    const expectedAmount = Number(appointment.totalAmount);
    if (settings.fullPaymentRequired && input.amountPaid < expectedAmount) {
        throw new errors_1.UnprocessableError(`The amount paid (₦${input.amountPaid.toLocaleString()}) is less than the required amount (₦${expectedAmount.toLocaleString()}). Please pay the full amount.`);
    }
    const minAmount = Number(settings.minAmount) || 0;
    if (input.amountPaid < minAmount) {
        throw new errors_1.UnprocessableError(`Payment amount does not meet the minimum of ₦${minAmount.toLocaleString()}.`);
    }
    let receiptUrl = payment.receiptUrl;
    let receiptPublicId = payment.receiptPublicId;
    if (receiptBuffer) {
        const uploaded = await (0, upload_1.uploadImageToCloudinary)(receiptBuffer, 'sawaba-receipts', 'image/jpeg');
        receiptUrl = uploaded.url;
        receiptPublicId = uploaded.publicId;
        if (payment.receiptPublicId && payment.receiptPublicId !== receiptPublicId) {
            try {
                await (0, upload_1.deleteImageByUrl)(payment.receiptUrl ?? '');
            }
            catch {
                // best-effort cleanup of the previous receipt
            }
        }
    }
    await database_1.prisma.payment.update({
        where: { id: payment.id },
        data: {
            paymentMethod: input.paymentMethod,
            amount: input.amountPaid,
            transactionReference: input.transactionReference || null,
            paymentDate: input.paymentDate,
            note: input.note ?? null,
            receiptUrl,
            receiptPublicId,
            status: 'PENDING_VERIFICATION',
            rejectionReason: null,
        },
    });
    await database_1.prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_SUBMITTED },
    });
    const fresh = await getPaymentByAppointmentId(appointment.id);
    return { payment: serializePayment(fresh), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
/**
 * Cash flow (customer side): the customer declares they will pay cash at the salon.
 */
async function declareCashPayment(token) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { accessToken: token },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found. Check the link and try again.');
    }
    const appointment = payment.appointment;
    if (!appointment || appointment.status === appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        throw new errors_1.UnprocessableError('This appointment has been cancelled and cannot accept a payment.');
    }
    if (payment.status === 'PAID') {
        throw new errors_1.ConflictError('This appointment has already been paid and verified.');
    }
    if (payment.status === 'PENDING_VERIFICATION') {
        throw new errors_1.ConflictError('A payment is already under review for this appointment.');
    }
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    const enabled = (settings.enabledPaymentMethods ?? []);
    if (enabled.length > 0 && !enabled.includes('CASH')) {
        throw new errors_1.UnprocessableError('Cash payment is not currently accepted. Please choose another method.');
    }
    await database_1.prisma.payment.update({
        where: { id: payment.id },
        data: {
            paymentMethod: 'CASH',
            amount: Number(appointment.totalAmount),
            status: 'UNPAID',
            rejectionReason: null,
        },
    });
    const fresh = await getPaymentByAppointmentId(appointment.id);
    return { payment: serializePayment(fresh), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
async function trackPayment(input) {
    const normalize = (phone) => phone.replace(/\D/g, '').slice(-10);
    const identifier = input.appointmentId.trim().toUpperCase();
    let appointment = null;
    if (/^\d+$/.test(identifier)) {
        appointment = await database_1.prisma.appointment.findUnique({ where: { id: Number(identifier) } });
    }
    if (!appointment) {
        appointment = await database_1.prisma.appointment.findUnique({ where: { referenceCode: identifier } });
    }
    if (!appointment || normalize(appointment.customerPhone) !== normalize(input.phone)) {
        throw new errors_1.NotFoundError('No appointment matches those details. Please check and try again.');
    }
    const payment = await getPaymentByAppointmentId(appointment.id);
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    return { payment: serializePayment(payment), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
/**
 * Builds the Prisma filter shared by the list, summary and CSV export so all
 * three always agree on what a "transaction matching this query" is.
 * Status and search are only applied when present — the summary intentionally
 * omits them so it can total every status at once.
 */
function buildPaymentWhere(query) {
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.method)
        where.paymentMethod = query.method;
    const and = [];
    if (query.from || query.to) {
        // paymentDate is the YYYY-MM-DD the customer declared; rows without one
        // are dated by when the record was created so they stay in range.
        and.push({
            OR: [
                {
                    paymentDate: {
                        ...(query.from ? { gte: query.from } : {}),
                        ...(query.to ? { lte: query.to } : {}),
                    },
                },
                {
                    paymentDate: null,
                    createdAt: {
                        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
                        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
                    },
                },
            ],
        });
    }
    const search = query.search?.trim();
    if (search) {
        const isNum = /^\d+$/.test(search);
        and.push({
            OR: [
                { transactionReference: { contains: search } },
                {
                    appointment: {
                        OR: [
                            { referenceCode: { contains: search } },
                            { customerName: { contains: search } },
                            { customerPhone: { contains: search } },
                            ...(isNum ? [{ id: Number(search) }] : []),
                        ],
                    },
                },
            ],
        });
    }
    if (and.length > 0)
        where.AND = and;
    return where;
}
async function listPayments(query) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const where = buildPaymentWhere(query);
    const [rows, total] = await Promise.all([
        database_1.prisma.payment.findMany({
            where,
            include: paymentInclude,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
        }),
        database_1.prisma.payment.count({ where }),
    ]);
    return {
        items: rows.map(serializePayment),
        total,
        page,
        perPage,
    };
}
async function getPaymentById(id) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { id },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found.');
    }
    const serialized = serializePayment(payment);
    if (payment.verifiedBy) {
        const admin = await database_1.prisma.admin.findUnique({
            where: { id: payment.verifiedBy },
            select: { name: true },
        });
        serialized.verifiedByName = admin?.name ?? null;
    }
    return serialized;
}
async function verifyPayment(id, adminId) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { id },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found.');
    }
    if (payment.status === 'PAID') {
        throw new errors_1.ConflictError('This payment is already verified.');
    }
    if (payment.status !== 'PENDING_VERIFICATION') {
        throw new errors_1.UnprocessableError('Only submitted payments can be verified.');
    }
    if (!payment.receiptUrl && payment.paymentMethod !== 'CASH') {
        const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
        if (settings.receiptRequired) {
            throw new errors_1.UnprocessableError('This payment has no uploaded receipt. Ask the customer to submit it, or reject the payment with a reason so they can retry.');
        }
    }
    await database_1.prisma.payment.update({
        where: { id },
        data: {
            status: 'PAID',
            verifiedBy: adminId,
            verifiedAt: new Date(),
        },
    });
    await applyProviderVerification(payment.appointmentId, {
        provider: 'manual',
        providerRef: null,
        adminId,
    });
    await notifyBarberPaymentVerified(payment.appointmentId);
    return getPaymentById(id);
}
/** Cash flow: the customer pays physically at the salon. */
async function confirmCashPayment(id, adminId, note) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { id },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found.');
    }
    if (payment.paymentMethod !== 'CASH') {
        throw new errors_1.UnprocessableError('This payment is not a cash payment.');
    }
    if (payment.status === 'PAID') {
        throw new errors_1.ConflictError('This cash payment is already confirmed.');
    }
    if (payment.status === 'CANCELLED' || payment.status === 'REFUNDED') {
        throw new errors_1.UnprocessableError('This payment can no longer be confirmed.');
    }
    const appointment = payment.appointment;
    if (!appointment || appointment.status === appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        throw new errors_1.UnprocessableError('The appointment for this payment has been cancelled.');
    }
    await database_1.prisma.payment.update({
        where: { id },
        data: {
            status: 'PAID',
            paymentDate: new Date().toISOString().slice(0, 10),
            verifiedBy: adminId,
            verifiedAt: new Date(),
            note: note ?? payment.note ?? 'Cash received at salon.',
            rejectionReason: null,
        },
    });
    await applyProviderVerification(payment.appointmentId, {
        provider: 'cash-at-salon',
        providerRef: null,
        adminId,
    });
    await notifyBarberPaymentVerified(payment.appointmentId);
    return getPaymentById(id);
}
async function rejectPayment(id, reason, adminId) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { id },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found.');
    }
    if (payment.status === 'PAID') {
        throw new errors_1.ConflictError('This payment is already verified and cannot be rejected.');
    }
    await database_1.prisma.payment.update({
        where: { id },
        data: {
            status: 'REJECTED',
            rejectionReason: reason,
            verifiedBy: adminId,
            verifiedAt: null,
        },
    });
    const appointment = payment.appointment;
    if (appointment && appointment.status !== appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        await database_1.prisma.appointment.update({
            where: { id: appointment.id },
            data: { status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REJECTED },
        });
    }
    return getPaymentById(id);
}
async function markPaymentCancelled(appointmentId) {
    const payment = await database_1.prisma.payment.findUnique({ where: { appointmentId } });
    if (payment && payment.status !== 'PAID') {
        await database_1.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'CANCELLED' },
        });
    }
}
/**
 * Aggregated revenue figures for the admin transaction dashboard.
 * Revenue is only ever counted from PAID (verified) payments — pending,
 * rejected or unverified money never contributes to a total.
 */
async function getPaymentSummary(query) {
    const where = buildPaymentWhere(query);
    const [byStatus, total] = await Promise.all([
        database_1.prisma.payment.groupBy({
            by: ['status'],
            where,
            _count: { _all: true },
            _sum: { amount: true },
        }),
        database_1.prisma.payment.count({ where }),
    ]);
    const stat = (status) => {
        const row = byStatus.find((entry) => entry.status === status);
        return { count: row?._count._all ?? 0, total: Number(row?._sum.amount ?? 0) };
    };
    const successful = stat('PAID');
    const pending = stat('PENDING_VERIFICATION');
    const failed = stat('REJECTED');
    const refunded = stat('REFUNDED');
    const unpaid = stat('UNPAID');
    // Today's revenue = money confirmed today (UTC day, the same clock the
    // backend stamps records with).
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todayAggregate = await database_1.prisma.payment.aggregate({
        where: { ...where, status: 'PAID', verifiedAt: { gte: startOfToday } },
        _sum: { amount: true },
        _count: { _all: true },
    });
    return {
        totalTransactions: total,
        successfulCount: successful.count,
        successfulTotal: successful.total,
        pendingCount: pending.count,
        pendingTotal: pending.total,
        todayCount: todayAggregate._count._all,
        todayTotal: Number(todayAggregate._sum.amount ?? 0),
        failedCount: failed.count,
        failedTotal: failed.total,
        refundedCount: refunded.count,
        refundedTotal: refunded.total,
        unpaidCount: unpaid.count,
    };
}
/**
 * Refunds a verified payment — the money went back to the customer. Only a
 * PAID payment can be refunded, so a pending or rejected payment can never
 * become a phantom refund. Unsettled commission is unwound; payouts that were
 * already paid out to a barber are never rewritten.
 */
async function markPaymentRefunded(id, reason, adminId) {
    const payment = await database_1.prisma.payment.findUnique({
        where: { id },
        include: paymentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found.');
    }
    if (payment.status !== 'PAID') {
        throw new errors_1.UnprocessableError('Only verified payments can be refunded.');
    }
    await database_1.prisma.payment.update({
        where: { id },
        data: {
            status: 'REFUNDED',
            rejectionReason: reason,
            verifiedBy: adminId,
        },
    });
    // Refunded money is no longer money the studio kept: drop any unsettled
    // commission back to PENDING so it never pays out on a refunded sale.
    const earning = await database_1.prisma.barberEarning.findUnique({
        where: { appointmentId: payment.appointmentId },
    });
    if (earning && earning.status !== 'PAID') {
        await database_1.prisma.barberEarning.update({
            where: { id: earning.id },
            data: { status: 'PENDING', earnedAt: null },
        });
    }
    return getPaymentById(id);
}
const CSV_COLUMNS = [
    'Transaction Ref',
    'Booking Ref',
    'Customer',
    'Phone',
    'Email',
    'Service',
    'Barber',
    'Amount (NGN)',
    'Method',
    'Status',
    'Payment Date',
    'Verified At',
    'Receipt URL',
    'Note',
    'Created At',
];
function csvCell(value) {
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
/**
 * Renders the filtered transactions as CSV (CRLF, UTF-8 BOM) for accounting.
 * Shares the exact where-clause with the list so the export always matches
 * what the admin sees on screen.
 */
async function exportPayments(query) {
    const rows = await database_1.prisma.payment.findMany({
        where: buildPaymentWhere(query),
        include: paymentInclude,
        orderBy: { createdAt: 'desc' },
        take: 10000,
    });
    const lines = [CSV_COLUMNS.join(',')];
    for (const payment of rows) {
        const appointment = payment.appointment;
        lines.push([
            csvCell(payment.transactionReference ?? ''),
            csvCell(appointment?.referenceCode ?? appointment?.id ?? ''),
            csvCell(appointment?.customerName ?? ''),
            csvCell(appointment?.customerPhone ?? ''),
            csvCell(appointment?.customerEmail ?? ''),
            csvCell(appointment?.service?.name ?? ''),
            csvCell(appointment?.barber?.name ?? ''),
            csvCell(Number(payment.amount).toFixed(2)),
            csvCell(payment.paymentMethod ?? ''),
            csvCell(payment.status),
            csvCell(payment.paymentDate ?? ''),
            csvCell(payment.verifiedAt ? payment.verifiedAt.toISOString() : ''),
            csvCell(payment.receiptUrl ?? ''),
            csvCell(payment.note ?? ''),
            csvCell(payment.createdAt.toISOString()),
        ].join(','));
    }
    return lines.join('\r\n');
}
//# sourceMappingURL=paymentService.js.map