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
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const availabilityService_1 = require("./availabilityService");
const customerService_1 = require("./customerService");
const commissionService_1 = require("./commissionService");
const upload_1 = require("../utils/upload");
const paymentSettingsService_1 = require("./paymentSettingsService");
const appointmentStatuses_1 = require("../config/appointmentStatuses");
/**
 * Temporary booking checkout sessions.
 *
 * STRICT RULE: no Appointment and no Payment rows exist until the selected
 * payment method's required condition is satisfied. The session alone carries
 * the booking details; abandoning it (Back to Home / closed tab / never
 * finishing payment) leaves ZERO permanent records.
 *
 *   CASH                    → finalizeCheckout() creates Appointment(PENDING* + UNPAID)
 *   BANK_TRANSFER / OPAY    → session stores the receipt, finalizeCheckout() creates
 *                             Appointment + Payment(PENDING_VERIFICATION) atomically
 *   ONLINE                  → Paystack transaction on the SESSION; Appointment +
 *                             Payment are created only after the backend re-verifies
 *                             the charge directly with Paystack (callback/webhook)
 *
 * *Status naming: the existing schema calls the unpaid-awaiting-confirmation
 * state PAYMENT_REQUIRED; the customer-facing flow treats it as "PENDING".
 */
function generateSessionToken() {
    return node_crypto_1.default.randomBytes(24).toString('hex');
}
function dateKey(date) {
    return date.replace(/-/g, '');
}
async function generateReferenceCode(appointmentDate, t) {
    const key = dateKey(appointmentDate);
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const dayCount = await models_1.Appointment.count({ where: { appointmentDate }, transaction: t });
        const candidate = `APT-${key}-${String(dayCount + 1 + attempt).padStart(3, '0')}`;
        const taken = await models_1.Appointment.findOne({ where: { referenceCode: candidate }, transaction: t });
        if (!taken)
            return candidate;
    }
    const salt = node_crypto_1.default.randomBytes(2).toString('hex').toUpperCase();
    return `APT-${key}-${salt}`;
}
/** Validates the barber/service/date/time and returns the authoritative price. Returns null when the slot is free. */
async function assertSessionBookable(barberId, serviceId, date, time, excludeAppointmentId, excludeSessionId) {
    const barber = await models_1.Barber.findByPk(barberId);
    if (!barber || !barber.isActive) {
        throw new errors_1.UnprocessableError('The selected barber is not available.');
    }
    const service = await models_1.Service.findByPk(serviceId);
    if (!service || !service.isActive) {
        throw new errors_1.UnprocessableError('The selected service is not available.');
    }
    const providerLink = await models_1.BarberService.findOne({ where: { barberId, serviceId } });
    const hasAnyServices = await models_1.BarberService.findOne({ where: { barberId } });
    // If the barber has at least one service assignment and this service is not
    // among them, reject. No assignments yet → single-salon fallback, allow all.
    if (hasAnyServices && !providerLink) {
        throw new errors_1.UnprocessableError('This barber does not provide the selected service.');
    }
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    const hasAnyAvailability = await models_1.BarberAvailability.findOne({ where: { barberId } });
    if (hasAnyAvailability) {
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
    const todayISO = new Date().toISOString().slice(0, 10);
    if (date < todayISO) {
        throw new errors_1.UnprocessableError('Appointments cannot be booked in the past.');
    }
    const start = (0, availabilityService_1.hhmmToMinutes)(time);
    const end = start + service.duration;
    const existingQuery = {
        barberId,
        appointmentDate: date,
        status: { [sequelize_1.Op.ne]: appointmentStatuses_1.AppointmentStatusValue.CANCELLED },
    };
    const existing = excludeAppointmentId
        ? await models_1.Appointment.findAll({
            where: { ...existingQuery, id: { [sequelize_1.Op.ne]: excludeAppointmentId } },
        })
        : await models_1.Appointment.findAll({ where: existingQuery });
    // Only a payment genuinely in flight (AWAITING_PAYMENT) holds the slot.
    // Merely-staged (OPEN) sessions hold NOTHING — availability shown to the
    // customer always reflects reality, and the transaction-protected finalize
    // is the single arbiter if two customers race for the same slot. The
    // caller's own session is excluded so it can never conflict with itself.
    const openSessions = await models_1.CheckoutSession.findAll({
        where: {
            barberId,
            appointmentDate: date,
            status: 'AWAITING_PAYMENT',
            ...(excludeAppointmentId ? { id: { [sequelize_1.Op.ne]: excludeAppointmentId } } : {}),
            ...(excludeSessionId ? { id: { [sequelize_1.Op.ne]: excludeSessionId } } : {}),
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
    const services = await models_1.Service.findAll({ where: { id: serviceIds } });
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
    const session = await models_1.CheckoutSession.findOne({
        where: { sessionToken },
        include: [
            { model: models_1.Service, as: 'service', attributes: ['id', 'name'] },
            { model: models_1.Barber, as: 'barber', attributes: ['id', 'name'] },
        ],
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
    // TRANSFER methods must already carry the receipt at session creation.
    const isCash = input.paymentMethod === 'CASH';
    if (!isCash && input.paymentMethod !== 'ONLINE' && !input.receiptBuffer) {
        throw new errors_1.UnprocessableError('Payment receipt is required before you can submit your appointment.');
    }
    const slot = await assertSessionBookable(input.barberId, input.serviceId, input.appointmentDate, input.appointmentTime);
    if (!slot) {
        throw new errors_1.ConflictError('This time slot is no longer available. Please choose another time.');
    }
    // Upload the receipt only after slot checks pass — failed sessions never
    // leave orphan files.
    let receiptUrl = null;
    let receiptPublicId = null;
    if (input.receiptBuffer) {
        const uploaded = await (0, upload_1.uploadImageToCloudinary)(input.receiptBuffer, 'sawaba-receipts', input.receiptMimetype ?? 'image/jpeg');
        receiptUrl = uploaded.url;
        receiptPublicId = uploaded.publicId;
    }
    // Supersede the customer's own stale in-flight sessions for this exact slot:
    //  - after Paystack's transaction window an abandoned online checkout can no
    //    longer be completed, so it must not keep holding the slot;
    //  - when the customer switches AWAY from online payment (picks cash or a
    //    transfer method instead), their abandoned Paystack checkout is dead by
    //    definition — the slot releases immediately.
    await models_1.CheckoutSession.update({ status: 'EXPIRED' }, {
        where: {
            customerPhone: input.customerPhone,
            barberId: input.barberId,
            appointmentDate: input.appointmentDate,
            appointmentTime: input.appointmentTime,
            status: 'AWAITING_PAYMENT',
            updatedAt: { [sequelize_1.Op.lt]: new Date(Date.now() - 30 * 60 * 1000) },
        },
    });
    if (input.paymentMethod !== 'ONLINE') {
        await models_1.CheckoutSession.update({ status: 'EXPIRED' }, {
            where: {
                customerPhone: input.customerPhone,
                barberId: input.barberId,
                appointmentDate: input.appointmentDate,
                appointmentTime: input.appointmentTime,
                status: 'AWAITING_PAYMENT',
                paymentMethod: 'ONLINE',
            },
        });
    }
    else {
        // Retrying ONLINE for the same slot RESUMES the customer's own in-flight
        // session instead of being blocked by it (or piling up a duplicate).
        const own = await models_1.CheckoutSession.findOne({
            where: {
                customerPhone: input.customerPhone,
                barberId: input.barberId,
                appointmentDate: input.appointmentDate,
                appointmentTime: input.appointmentTime,
                status: 'AWAITING_PAYMENT',
            },
            order: [['updatedAt', 'DESC']],
        });
        if (own) {
            await own.update({
                customerName: input.customerName,
                customerEmail: input.customerEmail,
                customerLocation: input.customerLocation,
                serviceId: input.serviceId,
                notes: input.notes,
            });
            return serializeSession(await loadSessionWithRelations(own.sessionToken));
        }
    }
    // One session per (name, phone, slot, method): re-entering the payment step
    // refreshes the existing session instead of piling up duplicates.
    const [session] = await models_1.CheckoutSession.findOrCreate({
        where: {
            customerPhone: input.customerPhone,
            appointmentDate: input.appointmentDate,
            appointmentTime: input.appointmentTime,
            barberId: input.barberId,
            status: 'OPEN',
        },
        defaults: {
            sessionToken: generateSessionToken(),
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
    // Refresh mutable fields if the session already existed (name/email/notes/service/receipt/method).
    await session.update({
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerLocation: input.customerLocation,
        serviceId: input.serviceId,
        notes: input.notes,
        totalAmount: slot.servicePrice,
        paymentMethod: input.paymentMethod,
        transactionReference: input.transactionReference,
        ...(receiptUrl ? { receiptUrl, receiptPublicId } : {}),
    });
    return serializeSession(await loadSessionWithRelations(session.sessionToken));
}
/**
 * Converts an OPEN/refreshed session into a real Appointment + Payment pair,
 * ATOMICALLY. Cash → Payment UNPAID (pay at studio); transfer methods →
 * Payment PENDING_VERIFICATION with the stored receipt. Re-checks the slot
 * inside the transaction so a session whose slot was lost fails cleanly.
 */
async function finalizeCheckout(sessionToken) {
    const session = await loadSessionWithRelations(sessionToken);
    if (session.status === 'CONVERTED') {
        // Idempotent double-click protection — return the existing booking.
        if (session.convertedAppointmentId) {
            const existing = await models_1.Appointment.findByPk(session.convertedAppointmentId, {
                include: ['service', 'barber', { model: models_1.Payment, as: 'payment' }],
            });
            if (existing) {
                const payment = existing.payment;
                return {
                    appointment: {
                        id: existing.id,
                        referenceCode: existing.referenceCode,
                        status: existing.status,
                        customerName: existing.customerName,
                        appointmentDate: existing.appointmentDate,
                        appointmentTime: existing.appointmentTime,
                    },
                    payment: {
                        id: payment?.id ?? 0,
                        accessToken: payment?.accessToken ?? '',
                        amount: Number(payment?.amount ?? existing.totalAmount),
                        status: payment?.status ?? 'UNPAID',
                    },
                    sessionToken,
                };
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
    const result = await database_1.sequelize.transaction(async (t) => {
        // Re-verify the slot INSIDE the transaction. The session itself is
        // excluded — it must never conflict with its own slot — so only REAL
        // appointments and other customers' in-flight payments can block it.
        const slot = await assertSessionBookable(session.barberId, session.serviceId, session.appointmentDate, session.appointmentTime, session.convertedAppointmentId ?? undefined, session.id);
        if (!slot) {
            throw new errors_1.ConflictError('This time slot is no longer available. Your session payment cannot be applied — please book again.');
        }
        const customer = await (0, customerService_1.findOrCreateCustomer)({
            fullName: session.customerName,
            phone: session.customerPhone,
            email: session.customerEmail,
        }, t);
        const appointment = await models_1.Appointment.create({
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
            status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_REQUIRED, // customer-facing: PENDING
            referenceCode: await generateReferenceCode(session.appointmentDate, t),
        }, { transaction: t });
        // Commission snapshot (requirement #9): freeze the barber's CURRENT
        // commission terms onto this booking — later config changes never
        // rewrite this row.
        await (0, commissionService_1.createEarningSnapshot)(appointment.id, session.barberId, Number(session.totalAmount), t);
        const payment = await models_1.Payment.create({
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
        }, { transaction: t });
        if (!isCash) {
            // Receipt-backed bookings land in the admin verification queue.
            await appointment.update({ status: appointmentStatuses_1.AppointmentStatusValue.PAYMENT_SUBMITTED }, { transaction: t });
        }
        await session.update({ status: 'CONVERTED', convertedAppointmentId: appointment.id }, { transaction: t });
        return { appointment, payment };
    });
    return {
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
    };
}
/** Marks a session EXPIRED (customer abandoned the checkout). Booking data is dropped — nothing was ever saved as an appointment. */
async function abandonCheckout(sessionToken) {
    const session = await models_1.CheckoutSession.findOne({ where: { sessionToken } });
    if (!session || session.status === 'CONVERTED') {
        return { abandoned: false };
    }
    await session.update({ status: 'EXPIRED' });
    return { abandoned: true };
}
// ─── Online (Paystack) checkout on the SESSION ────────────────────────────────
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
    // Idempotent: a session already awaiting payment resumes the SAME transaction.
    if (session.status === 'AWAITING_PAYMENT' && session.paystackReference) {
        const existing = await paystackRequest('POST', '/transaction/initialize', {
            email: session.customerEmail ?? `${session.customerPhone.replace(/\D/g, '')}@payments.sawabasalon.com`,
            amount: Math.round(Number(session.totalAmount) * 100),
            reference: session.paystackReference,
        }).catch(async () => {
            // Reference already used → start a fresh one.
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
    await session.update({ status: 'AWAITING_PAYMENT', paystackReference: init.reference });
    return {
        authorizationUrl: init.authorization_url,
        accessCode: init.access_code,
        reference: init.reference,
    };
}
/**
 * Re-verifies the charge directly with Paystack and — only on confirmed
 * success — atomically creates the Appointment + Payment. This is the ONLY
 * path that turns an ONLINE checkout session into a real booking.
 */
async function verifyCheckoutPaystack(sessionToken, reference) {
    const session = await loadSessionWithRelations(sessionToken);
    if (session.status === 'CONVERTED') {
        // Already finalized (webhook beat the callback) → return current state.
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
    // Provider confirmed the money — NOW create the appointment + payment.
    const result = await finalizeCheckout(sessionToken);
    // Stamp the provider reference on the payment for audit.
    await models_1.Payment.update({ providerRef: String(txn.id), paymentMethod: 'ONLINE' }, { where: { id: result.payment.id } });
    return result;
}
async function finalizeResultForConverted(session) {
    if (!session.convertedAppointmentId)
        return null;
    const existing = await models_1.Appointment.findByPk(session.convertedAppointmentId, {
        include: ['service', 'barber', { model: models_1.Payment, as: 'payment' }],
    });
    if (!existing)
        return null;
    const payment = existing.payment;
    return {
        appointment: {
            id: existing.id,
            referenceCode: existing.referenceCode,
            status: existing.status,
            customerName: existing.customerName,
            appointmentDate: existing.appointmentDate,
            appointmentTime: existing.appointmentTime,
        },
        payment: {
            id: payment?.id ?? 0,
            accessToken: payment?.accessToken ?? '',
            amount: Number(payment?.amount ?? existing.totalAmount),
            status: payment?.status ?? 'UNPAID',
        },
        sessionToken: session.sessionToken,
    };
}
/** Webhook path: charge.success on a checkout session → verify + finalize. */
async function handleCheckoutWebhook(payload) {
    if (payload.event !== 'charge.success')
        return false;
    const sessionToken = payload.data?.metadata?.sessionToken;
    if (!sessionToken)
        return false;
    const session = await models_1.CheckoutSession.findOne({ where: { sessionToken } });
    if (!session || session.status !== 'AWAITING_PAYMENT' || !session.paystackReference)
        return false;
    // Signature already validated by the controller; verify the charge server-side.
    await verifyCheckoutPaystack(sessionToken, session.paystackReference);
    return true;
}
/** Public session view for the payment step. */
async function getCheckoutSession(sessionToken) {
    return serializeSession(await loadSessionWithRelations(sessionToken));
}
//# sourceMappingURL=checkoutService.js.map