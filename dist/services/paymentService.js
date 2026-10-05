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
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const upload_1 = require("../utils/upload");
const paymentSettingsService_1 = require("./paymentSettingsService");
const commissionService_1 = require("./commissionService");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
const appointmentInclude = [
    {
        model: models_1.Appointment,
        as: 'appointment',
        include: [
            { model: models_1.Service, as: 'service' },
            { model: models_1.Barber, as: 'barber' },
        ],
    },
];
/** Marks a payment PAID on provider/admin confirmation and advances the appointment. */
async function applyProviderVerification(appointmentId, info) {
    const payment = await models_1.Payment.findOne({ where: { appointmentId } });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment record not found for this appointment.');
    }
    if (payment.status !== 'PAID') {
        await payment.update({
            status: 'PAID',
            verifiedBy: info?.adminId ?? null,
            verifiedAt: new Date(),
            rejectionReason: null,
            ...(info?.providerRef ? { providerRef: info.providerRef } : {}),
        });
    }
    const appointment = await models_1.Appointment.findByPk(appointmentId);
    if (appointment && appointment.status !== appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        if (appointment.status !== appointmentStatuses_1.AppointmentStatusValue.PAYMENT_VERIFIED) {
            await appointment.update({ status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_VERIFIED });
        }
        // Auto-advance into service when valid; provider-confirmed payments may jump
        // straight from PAYMENT_REQUIRED because Paystack attested the money arrived.
        const canAutoAdvance = (0, appointmentStatuses_1.canTransition)(appointment.status, appointmentStatuses_1.AppointmentStatusValue.READY_FOR_SERVICE) ||
            appointment.status === appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REQUIRED;
        if (canAutoAdvance &&
            appointment.status !== appointmentStatuses_1.AppointmentStatusValue.READY_FOR_SERVICE &&
            appointment.status !== appointmentStatuses_1.AppointmentStatusValue.IN_PROGRESS &&
            appointment.status !== appointmentStatuses_1.AppointmentStatusValue.COMPLETED) {
            await appointment.update({ status: appointmentStatuses_1.AppointmentStatusValue.READY_FOR_SERVICE });
        }
    }
    // Money is now confirmed — re-evaluate the commission ledger (#19). If the
    // appointment is already COMPLETED the earning flips to EARNED here; if the
    // appointment completes later, the status transition re-syncs it.
    await (0, commissionService_1.syncEarningForAppointment)(appointmentId);
    return getPublicPaymentByAppointmentId(appointmentId);
}
async function getPublicPaymentByAppointmentId(appointmentId) {
    const payment = await getPaymentByAppointmentId(appointmentId);
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    return { payment: serializePayment(payment), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
/** Finds a payment by its public access token (the /pay/:token URL). */
async function getPaymentByAccessToken(token) {
    const payment = await models_1.Payment.findOne({ where: { accessToken: token }, include: appointmentInclude });
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
    const payment = await models_1.Payment.findOne({
        where: { appointmentId },
        include: appointmentInclude,
    });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment record not found for this appointment.');
    }
    return payment;
}
async function getPublicPayment(token) {
    const payment = await models_1.Payment.findOne({ where: { accessToken: token }, include: appointmentInclude });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found. Check the link and try again.');
    }
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    return { payment: serializePayment(payment), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
async function submitPayment(token, input, receiptBuffer) {
    const payment = await models_1.Payment.findOne({ where: { accessToken: token }, include: appointmentInclude });
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
    // Cash never produces a paper/electronic receipt — the admin verifies it
    // in person. Every other method honours the settings toggle.
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
    await payment.update({
        paymentMethod: input.paymentMethod,
        amount: input.amountPaid,
        transactionReference: input.transactionReference || null,
        paymentDate: input.paymentDate,
        note: input.note ?? null,
        receiptUrl,
        receiptPublicId,
        status: 'PENDING_VERIFICATION',
        rejectionReason: null,
    });
    await appointment.update({ status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_SUBMITTED });
    const fresh = await getPaymentByAppointmentId(appointment.id);
    return { payment: serializePayment(fresh), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
/**
 * Cash flow (customer side): the customer declares they will pay cash at the
 * salon. This only RECORDS the chosen method — the payment stays UNPAID until
 * an admin confirms the money was physically received. No receipt, no
 * provider, no appointment confirmation.
 */
async function declareCashPayment(token) {
    const payment = await models_1.Payment.findOne({ where: { accessToken: token }, include: appointmentInclude });
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
    await payment.update({
        paymentMethod: 'CASH',
        amount: Number(appointment.totalAmount),
        status: 'UNPAID',
        rejectionReason: null,
    });
    const fresh = await getPaymentByAppointmentId(appointment.id);
    return { payment: serializePayment(fresh), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
async function trackPayment(input) {
    const normalize = (phone) => phone.replace(/\D/g, '').slice(-10);
    const identifier = input.appointmentId.trim().toUpperCase();
    const appointment = /^\d+$/.test(identifier)
        ? await models_1.Appointment.findByPk(Number(identifier))
        : await models_1.Appointment.findOne({ where: { referenceCode: identifier } });
    if (!appointment || normalize(appointment.customerPhone) !== normalize(input.phone)) {
        throw new errors_1.NotFoundError('No appointment matches those details. Please check and try again.');
    }
    const payment = await getPaymentByAppointmentId(appointment.id);
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    return { payment: serializePayment(payment), settings: (0, paymentSettingsService_1.serializePaymentSetting)(settings) };
}
async function listPayments(query) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const where = {};
    if (query.status)
        where.status = query.status;
    if (query.method)
        where.paymentMethod = query.method;
    if (query.from || query.to) {
        where.paymentDate = {
            ...(query.from ? { [sequelize_1.Op.gte]: query.from } : {}),
            ...(query.to ? { [sequelize_1.Op.lte]: query.to } : {}),
        };
    }
    const search = query.search?.trim();
    let appointmentWhere;
    if (search) {
        const orClauses = [
            { referenceCode: { [sequelize_1.Op.like]: `%${search}%` } },
            { customerName: { [sequelize_1.Op.like]: `%${search}%` } },
            { customerPhone: { [sequelize_1.Op.like]: `%${search}%` } },
        ];
        if (/^\d+$/.test(search)) {
            orClauses.push({ id: Number(search) });
        }
        appointmentWhere = { [sequelize_1.Op.or]: orClauses };
    }
    const { rows, count } = await models_1.Payment.findAndCountAll({
        where,
        include: [
            {
                model: models_1.Appointment,
                as: 'appointment',
                where: appointmentWhere,
                required: Boolean(appointmentWhere),
                include: [
                    { model: models_1.Service, as: 'service' },
                    { model: models_1.Barber, as: 'barber' },
                ],
            },
        ],
        distinct: true,
        order: [['createdAt', 'DESC']],
        offset,
        limit,
    });
    return {
        items: rows.map(serializePayment),
        total: count,
        page,
        perPage,
    };
}
async function getPaymentById(id) {
    const payment = await models_1.Payment.findByPk(id, { include: appointmentInclude });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found.');
    }
    return serializePayment(payment);
}
async function verifyPayment(id, adminId) {
    const payment = await models_1.Payment.findByPk(id, { include: appointmentInclude });
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
        // Receipt rule applies ONLY to receipt-based methods (transfer/OPay).
        // Cash is confirmed in person with "Mark Cash as Paid" — never here.
        const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
        if (settings.receiptRequired) {
            throw new errors_1.UnprocessableError('This payment has no uploaded receipt. Ask the customer to submit it, or reject the payment with a reason so they can retry.');
        }
    }
    await payment.update({
        status: 'PAID',
        verifiedBy: adminId,
        verifiedAt: new Date(),
    });
    // Delegate to the shared verification path (same logic as online/webhook verification).
    await applyProviderVerification(payment.appointmentId, {
        provider: 'manual',
        providerRef: null,
        adminId,
    });
    return getPaymentById(id);
}
/**
 * Cash flow: the customer pays physically at the salon. No receipt exists —
 * the admin confirms receipt of the money in person and the backend records
 * the audit trail (paid at, verified by, note).
 */
async function confirmCashPayment(id, adminId, note) {
    const payment = await models_1.Payment.findByPk(id, { include: appointmentInclude });
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
    await payment.update({
        status: 'PAID',
        paymentDate: new Date().toISOString().slice(0, 10),
        verifiedBy: adminId,
        verifiedAt: new Date(),
        note: note ?? payment.note ?? 'Cash received at salon.',
        rejectionReason: null,
    });
    await applyProviderVerification(payment.appointmentId, {
        provider: 'cash-at-salon',
        providerRef: null,
        adminId,
    });
    return getPaymentById(id);
}
async function rejectPayment(id, reason, adminId) {
    const payment = await models_1.Payment.findByPk(id, { include: appointmentInclude });
    if (!payment) {
        throw new errors_1.NotFoundError('Payment not found.');
    }
    if (payment.status === 'PAID') {
        throw new errors_1.ConflictError('This payment is already verified and cannot be rejected.');
    }
    await payment.update({
        status: 'REJECTED',
        rejectionReason: reason,
        verifiedBy: adminId,
        verifiedAt: null,
    });
    const appointment = payment.appointment;
    if (appointment && appointment.status !== appointmentStatuses_1.AppointmentStatusValue.CANCELLED) {
        await appointment.update({ status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REJECTED });
    }
    return getPaymentById(id);
}
async function markPaymentCancelled(appointmentId) {
    const payment = await models_1.Payment.findOne({ where: { appointmentId } });
    if (payment && payment.status !== 'PAID') {
        await payment.update({ status: 'CANCELLED' });
    }
}
//# sourceMappingURL=paymentService.js.map