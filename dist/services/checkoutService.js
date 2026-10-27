"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSession = createCheckoutSession;
exports.finalizeCheckout = finalizeCheckout;
exports.abandonCheckout = abandonCheckout;
exports.initializeCheckoutPaystack = initializeCheckoutPaystack;
exports.verifyCheckoutPaystack = verifyCheckoutPaystack;
exports.handleCheckoutWebhook = handleCheckoutWebhook;
exports.getCheckoutSession = getCheckoutSession;
const node_crypto_1 = __importDefault(require("node:crypto"));
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const availabilityService_1 = require("./availabilityService");
const customerService_1 = require("./customerService");
const commissionService_1 = require("./commissionService");
const upload_1 = require("../utils/upload");
const paymentSettingsService_1 = require("./paymentSettingsService");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
const qrService_1 = require("./qrService");
function generateSessionToken() {
    return node_crypto_1.default.randomBytes(24).toString('hex');
}
function dateKey(date) {
    return date.replace(/-/g, '');
}
async function generateReferenceCode(appointmentDate, tx = database_1.prisma) {
    const key = dateKey(appointmentDate);
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const dayCount = await tx.appointment.count({ where: { appointmentDate } });
        const candidate = `APT-${key}-${String(dayCount + 1 + attempt).padStart(3, '0')}`;
        const taken = await tx.appointment.findUnique({ where: { referenceCode: candidate } });
        if (!taken)
            return candidate;
    }
    const salt = node_crypto_1.default.randomBytes(2).toString('hex').toUpperCase();
    return `APT-${key}-${salt}`;
}
/** Validates the barber/service/date/time and returns the authoritative price. Returns null when the slot is free. */
async function assertSessionBookable(barberId, serviceId, date, time, excludeAppointmentId, excludeSessionId, tx = database_1.prisma) {
    const barber = await tx.barber.findUnique({ where: { id: barberId } });
    if (!barber || !barber.isActive) {
        throw new errors_1.UnprocessableError('The selected barber is not available.');
    }
    const service = await tx.service.findUnique({ where: { id: serviceId } });
    if (!service || !service.isActive) {
        throw new errors_1.UnprocessableError('The selected service is not available.');
    }
    const providerLink = await tx.barberService.findFirst({ where: { barberId, serviceId } });
    const hasAnyServices = await tx.barberService.findFirst({ where: { barberId } });
    if (hasAnyServices && !providerLink) {
        throw new errors_1.UnprocessableError('This barber does not provide the selected service.');
    }
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    const hasAnyAvailability = await tx.barberAvailability.findFirst({ where: { barberId } });
    if (hasAnyAvailability) {
        const availability = await tx.barberAvailability.findFirst({
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
    const end = start + service.duration;
    const existing = await tx.appointment.findMany({
        where: {
            barberId,
            appointmentDate: date,
            status: { not: appointmentStatuses_1.AppointmentStatusValue.CANCELLED },
            ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        },
    });
    const openSessions = await tx.checkoutSession.findMany({
        where: {
            barberId,
            appointmentDate: date,
            status: 'AWAITING_PAYMENT',
            ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
            ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
        },
    });
    for (const session of openSessions) {
        const sessionStart = (0, availabilityService_1.hhmmToMinutes)(session.appointmentTime);
        const sessionEnd = sessionStart + service.duration;
        if (start < sessionEnd && end > sessionStart) {
            return null; // slot held by another in-progress checkout
        }
    }
    const serviceIds = [...new Set(existing.map((a) => a.serviceId))];
    const services = await tx.service.findMany({ where: { id: { in: serviceIds } } });
    const serviceMap = new Map(services.map((s) => [s.id, s.duration]));
    for (const appointment of existing) {
        const existingStart = (0, availabilityService_1.hhmmToMinutes)(appointment.appointmentTime);
        const existingEnd = existingStart + (serviceMap.get(appointment.serviceId) ?? service.duration);
        if (start < existingEnd && end > existingStart) {
            return null; // slot taken by a real appointment
        }
    }
    return { servicePrice: Number(service.price), serviceDuration: service.duration };
}
const sessionInclude = {
    service: { select: { id: true, name: true } },
    barber: { select: { id: true, name: true } },
};
function serializeSession(session) {
    return {
        sessionToken: session.sessionToken,
        totalAmount: Number(session.totalAmount),
        serviceName: session.service?.name ?? null,
        barberName: session.barber?.name ?? null,
        appointmentDate: session.appointmentDate,
        appointmentTime: session.appointmentTime,
        status: session.status,
        paystackReference: session.paystackReference,
    };
}
async function loadSessionWithRelations(sessionToken) {
    const session = await database_1.prisma.checkoutSession.findUnique({
        where: { sessionToken },
        include: sessionInclude,
    });
    if (!session) {
        throw new errors_1.NotFoundError('Booking session not found. Please start your booking again.');
    }
    return session;
}
/**
 * Creates (or updates) the checkout session for the customer's chosen slot.
 * This writes NOTHING to appointments/payments — it is a temporary session.
 */
async function createCheckoutSession(input) {
    if (input.paymentMethod === 'ONLINE' && !process.env.PAYSTACK_SECRET_KEY) {
        throw new errors_1.UnprocessableError('Online payment is not available right now. Please choose another payment method.');
    }
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    const enabled = (settings.enabledPaymentMethods ?? []);
    if (input.paymentMethod !== 'ONLINE' && enabled.length > 0 && !enabled.includes(input.paymentMethod)) {
        throw new errors_1.UnprocessableError('This payment method is not currently accepted. Please choose another method.');
    }
    const isCash = input.paymentMethod === 'CASH';
    if (!isCash && input.paymentMethod !== 'ONLINE' && !input.receiptBuffer) {
        throw new errors_1.UnprocessableError('Payment receipt is required before you can submit your appointment.');
    }
    const slot = await assertSessionBookable(input.barberId, input.serviceId, input.appointmentDate, input.appointmentTime);
    if (!slot) {
        throw new errors_1.ConflictError('This time slot is no longer available. Please choose another time.');
    }
    let receiptUrl = null;
    let receiptPublicId = null;
    if (input.receiptBuffer) {
        const uploaded = await (0, upload_1.uploadImageToCloudinary)(input.receiptBuffer, 'sawaba-receipts', input.receiptMimetype ?? 'image/jpeg');
        receiptUrl = uploaded.url;
        receiptPublicId = uploaded.publicId;
    }
    // Supersede stale in-flight sessions
    await database_1.prisma.checkoutSession.updateMany({
        where: {
            customerPhone: input.customerPhone,
            barberId: input.barberId,
            appointmentDate: input.appointmentDate,
            appointmentTime: input.appointmentTime,
            status: 'AWAITING_PAYMENT',
            updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
        },
        data: { status: 'EXPIRED' },
    });
    if (input.paymentMethod !== 'ONLINE') {
        await database_1.prisma.checkoutSession.updateMany({
            where: {
                customerPhone: input.customerPhone,
                barberId: input.barberId,
                appointmentDate: input.appointmentDate,
                appointmentTime: input.appointmentTime,
                status: 'AWAITING_PAYMENT',
                paymentMethod: 'ONLINE',
            },
            data: { status: 'EXPIRED' },
        });
    }
    else {
        const own = await database_1.prisma.checkoutSession.findFirst({
            where: {
                customerPhone: input.customerPhone,
                barberId: input.barberId,
                appointmentDate: input.appointmentDate,
                appointmentTime: input.appointmentTime,
                status: 'AWAITING_PAYMENT',
            },
            orderBy: { updatedAt: 'desc' },
        });
        if (own) {
            await database_1.prisma.checkoutSession.update({
                where: { id: own.id },
                data: {
                    customerName: input.customerName,
                    customerEmail: input.customerEmail,
                    customerLocation: input.customerLocation,
                    serviceId: input.serviceId,
                    notes: input.notes,
                },
            });
            return serializeSession(await loadSessionWithRelations(own.sessionToken));
        }
    }
    const existingOpen = await database_1.prisma.checkoutSession.findFirst({
        where: {
            customerPhone: input.customerPhone,
            appointmentDate: input.appointmentDate,
            appointmentTime: input.appointmentTime,
            barberId: input.barberId,
            status: 'OPEN',
        },
    });
    let sessionToken;
    if (existingOpen) {
        sessionToken = existingOpen.sessionToken;
        await database_1.prisma.checkoutSession.update({
            where: { id: existingOpen.id },
            data: {
                customerName: input.customerName,
                customerEmail: input.customerEmail,
                customerLocation: input.customerLocation,
                serviceId: input.serviceId,
                notes: input.notes,
                totalAmount: slot.servicePrice,
                paymentMethod: input.paymentMethod,
                transactionReference: input.transactionReference,
                ...(receiptUrl ? { receiptUrl, receiptPublicId } : {}),
            },
        });
    }
    else {
        sessionToken = generateSessionToken();
        await database_1.prisma.checkoutSession.create({
            data: {
                sessionToken,
                customerName: input.customerName,
                customerPhone: input.customerPhone,
                customerEmail: input.customerEmail,
                customerLocation: input.customerLocation,
                serviceId: input.serviceId,
                barberId: input.barberId,
                appointmentDate: input.appointmentDate,
                appointmentTime: input.appointmentTime,
                notes: input.notes,
                totalAmount: slot.servicePrice,
                paymentMethod: input.paymentMethod,
                transactionReference: input.transactionReference,
                status: 'OPEN',
                receiptUrl,
                receiptPublicId,
            },
        });
    }
    return serializeSession(await loadSessionWithRelations(sessionToken));
}
/**
 * Mints the appointment's check-in QR (idempotent — reuses the existing token)
 * and folds the payload into a finalize result. Never lets a QR hiccup fail a
 * booking that was already committed.
 */
async function withQr(appointmentId, base) {
    try {
        const token = await (0, qrService_1.ensureAppointmentQrToken)(appointmentId);
        return { ...base, qrToken: token, qrPayload: (0, qrService_1.buildQrPayload)(token) };
    }
    catch {
        return { ...base, qrToken: '', qrPayload: '' };
    }
}
async function finalizeCheckout(sessionToken) {
    const session = await loadSessionWithRelations(sessionToken);
    if (session.status === 'CONVERTED') {
        if (session.convertedAppointmentId) {
            const existing = await database_1.prisma.appointment.findUnique({
                where: { id: session.convertedAppointmentId },
                include: { payment: true },
            });
            if (existing) {
                return withQr(existing.id, {
                    appointment: {
                        id: existing.id,
                        referenceCode: existing.referenceCode,
                        status: existing.status,
                        customerName: existing.customerName,
                        appointmentDate: existing.appointmentDate,
                        appointmentTime: existing.appointmentTime,
                    },
                    payment: {
                        id: existing.payment?.id ?? 0,
                        accessToken: existing.payment?.accessToken ?? '',
                        amount: Number(existing.payment?.amount ?? existing.totalAmount),
                        status: existing.payment?.status ?? 'UNPAID',
                    },
                    sessionToken,
                });
            }
        }
        throw new errors_1.ConflictError('This booking session has already been used.');
    }
    if (session.status === 'EXPIRED') {
        throw new errors_1.ConflictError('This booking session has expired. Please start your booking again.');
    }
    const method = session.paymentMethod;
    if (!method) {
        throw new errors_1.UnprocessableError('Payment method is required.');
    }
    const settings = await (0, paymentSettingsService_1.getPaymentSettingsRecord)();
    const enabled = (settings.enabledPaymentMethods ?? []);
    if (method !== 'ONLINE' && enabled.length > 0 && !enabled.includes(method)) {
        throw new errors_1.UnprocessableError('This payment method is not currently accepted. Please choose another method.');
    }
    const isCash = method === 'CASH';
    const result = await database_1.prisma.$transaction(async (tx) => {
        const slot = await assertSessionBookable(session.barberId, session.serviceId, session.appointmentDate, session.appointmentTime, session.convertedAppointmentId ?? undefined, session.id, tx);
        if (!slot) {
            throw new errors_1.ConflictError('This time slot is no longer available. Your session payment cannot be applied — please book again.');
        }
        const customer = await (0, customerService_1.findOrCreateCustomer)({
            fullName: session.customerName,
            phone: session.customerPhone,
            email: session.customerEmail,
        }, tx);
        const referenceCode = await generateReferenceCode(session.appointmentDate, tx);
        const appointment = await tx.appointment.create({
            data: {
                customerName: session.customerName,
                customerPhone: session.customerPhone,
                customerEmail: session.customerEmail,
                customerLocation: session.customerLocation ?? null,
                customerId: customer.id,
                serviceId: session.serviceId,
                barberId: session.barberId,
                appointmentDate: session.appointmentDate,
                appointmentTime: session.appointmentTime,
                totalAmount: Number(session.totalAmount),
                notes: session.notes,
                status: !isCash ? appointmentStatuses_1.AppointmentStatusValue.PAYMENT_SUBMITTED : appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REQUIRED,
                referenceCode,
            },
        });
        await (0, commissionService_1.createEarningSnapshot)(appointment.id, session.barberId, Number(session.totalAmount), tx);
        const payment = await tx.payment.create({
            data: {
                appointmentId: appointment.id,
                customerId: customer.id,
                amount: Number(session.totalAmount),
                paymentMethod: method,
                transactionReference: session.transactionReference ?? null,
                paymentDate: isCash ? null : new Date().toISOString().slice(0, 10),
                receiptUrl: session.receiptUrl,
                receiptPublicId: session.receiptPublicId,
                note: null,
                status: isCash ? 'UNPAID' : 'PENDING_VERIFICATION',
                accessToken: node_crypto_1.default.randomBytes(24).toString('hex'),
            },
        });
        await tx.checkoutSession.update({
            where: { id: session.id },
            data: { status: 'CONVERTED', convertedAppointmentId: appointment.id },
        });
        return { appointment, payment };
    });
    return withQr(result.appointment.id, {
        appointment: {
            id: result.appointment.id,
            referenceCode: result.appointment.referenceCode,
            status: result.appointment.status,
            customerName: result.appointment.customerName,
            appointmentDate: result.appointment.appointmentDate,
            appointmentTime: result.appointment.appointmentTime,
        },
        payment: {
            id: result.payment.id,
            accessToken: result.payment.accessToken,
            amount: Number(result.payment.amount),
            status: result.payment.status,
        },
        sessionToken,
    });
}
/** Marks a session EXPIRED (customer abandoned the checkout). */
async function abandonCheckout(sessionToken) {
    const session = await database_1.prisma.checkoutSession.findUnique({ where: { sessionToken } });
    if (!session || session.status === 'CONVERTED') {
        return { abandoned: false };
    }
    await database_1.prisma.checkoutSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
    });
    return { abandoned: true };
}
const PAYSTACK_BASE = 'https://api.paystack.co';
async function paystackRequest(method, path, body) {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
        throw new errors_1.UnprocessableError('Online payment is not configured. Please contact the administrator.');
    }
    let response;
    try {
        response = await fetch(`${PAYSTACK_BASE}${path}`, {
            method,
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    }
    catch {
        throw new errors_1.UnprocessableError('Unable to connect to the payment gateway. Please try again.');
    }
    const json = (await response.json().catch(() => null));
    if (!response.ok || !json?.status) {
        throw new errors_1.UnprocessableError(json?.message ?? 'The payment gateway rejected this request. Please try again.');
    }
    return json.data;
}
/** Starts (or resumes) the Paystack checkout on this session. */
async function initializeCheckoutPaystack(sessionToken) {
    const session = await loadSessionWithRelations(sessionToken);
    if (session.status === 'CONVERTED') {
        throw new errors_1.ConflictError('This booking has already been completed.');
    }
    if (session.status === 'EXPIRED') {
        throw new errors_1.ConflictError('This booking session has expired. Please start your booking again.');
    }
    if (session.status === 'AWAITING_PAYMENT' && session.paystackReference) {
        const existing = await paystackRequest('POST', '/transaction/initialize', {
            email: session.customerEmail ?? `${session.customerPhone.replace(/\D/g, '')}@payments.sawabasalon.com`,
            amount: Math.round(Number(session.totalAmount) * 100),
            reference: session.paystackReference,
        }).catch(async () => {
            return null;
        });
        if (existing) {
            return { authorizationUrl: existing.authorization_url, accessCode: existing.access_code, reference: existing.reference };
        }
    }
    const reference = `SAWABA-CKT${session.id}-${Date.now()}`;
    const init = await paystackRequest('POST', '/transaction/initialize', {
        email: session.customerEmail ?? `${session.customerPhone.replace(/\D/g, '')}@payments.sawabasalon.com`,
        amount: Math.round(Number(session.totalAmount) * 100),
        reference,
        metadata: { checkoutSessionId: session.id, sessionToken: session.sessionToken },
    });
    await database_1.prisma.checkoutSession.update({
        where: { id: session.id },
        data: { status: 'AWAITING_PAYMENT', paystackReference: init.reference },
    });
    return {
        authorizationUrl: init.authorization_url,
        accessCode: init.access_code,
        reference: init.reference,
    };
}
/**
 * Re-verifies the charge directly with Paystack and creates Appointment + Payment.
 */
async function verifyCheckoutPaystack(sessionToken, reference) {
    const session = await loadSessionWithRelations(sessionToken);
    if (session.status === 'CONVERTED') {
        const result = await finalizeResultForConverted(session);
        if (result)
            return result;
        throw new errors_1.ConflictError('This booking has already been completed.');
    }
    if (!session.paystackReference || reference !== session.paystackReference) {
        throw new errors_1.UnprocessableError('This payment reference does not match this booking session.');
    }
    const txn = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (txn.status !== 'success') {
        throw new errors_1.UnprocessableError(`Paystack reports this payment as "${txn.status}". No booking has been created — please try again or choose another payment method.`);
    }
    const expectedKobo = Math.round(Number(session.totalAmount) * 100);
    if (txn.amount !== expectedKobo) {
        throw new errors_1.UnprocessableError('The paid amount does not match the booking price. Please contact support.');
    }
    const result = await finalizeCheckout(sessionToken);
    await database_1.prisma.payment.update({
        where: { id: result.payment.id },
        data: { providerRef: String(txn.id), paymentMethod: 'ONLINE' },
    });
    return result;
}
async function finalizeResultForConverted(session) {
    if (!session.convertedAppointmentId)
        return null;
    const existing = await database_1.prisma.appointment.findUnique({
        where: { id: session.convertedAppointmentId },
        include: { payment: true },
    });
    if (!existing)
        return null;
    return withQr(existing.id, {
        appointment: {
            id: existing.id,
            referenceCode: existing.referenceCode,
            status: existing.status,
            customerName: existing.customerName,
            appointmentDate: existing.appointmentDate,
            appointmentTime: existing.appointmentTime,
        },
        payment: {
            id: existing.payment?.id ?? 0,
            accessToken: existing.payment?.accessToken ?? '',
            amount: Number(existing.payment?.amount ?? existing.totalAmount),
            status: existing.payment?.status ?? 'UNPAID',
        },
        sessionToken: session.sessionToken,
    });
}
/** Webhook path: charge.success on a checkout session → verify + finalize. */
async function handleCheckoutWebhook(payload) {
    if (payload.event !== 'charge.success')
        return false;
    const sessionToken = payload.data?.metadata?.sessionToken;
    if (!sessionToken)
        return false;
    const session = await database_1.prisma.checkoutSession.findUnique({ where: { sessionToken } });
    if (!session || session.status !== 'AWAITING_PAYMENT' || !session.paystackReference)
        return false;
    await verifyCheckoutPaystack(sessionToken, session.paystackReference);
    return true;
}
/** Public session view for the payment step. */
async function getCheckoutSession(sessionToken) {
    return serializeSession(await loadSessionWithRelations(sessionToken));
}
//# sourceMappingURL=checkoutService.js.map