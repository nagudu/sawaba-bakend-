"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOrCreateCustomer = findOrCreateCustomer;
exports.ensureCustomerCode = ensureCustomerCode;
exports.backfillCustomerCodes = backfillCustomerCodes;
exports.backfillCustomerLinks = backfillCustomerLinks;
exports.getCustomerStats = getCustomerStats;
exports.listCustomers = listCustomers;
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const phone_1 = require("../utils/phone");
const errors_1 = require("../utils/errors");
/** Normalizes input and looks up (or creates) the single customer per phone. */
async function findOrCreateCustomer(input, t) {
    const phone = (0, phone_1.normalizeNigerianPhone)(input.phone);
    if (!(0, phone_1.isPlausiblePhone)(phone)) {
        throw new errors_1.UnprocessableError('Provide a valid phone number.');
    }
    const existing = await models_1.Customer.findOne({ where: { phone }, ...(t ? { transaction: t } : {}) });
    if (existing) {
        // Keep the appointment copy in sync with the most recent spelling of the
        // customer's name/email without overwriting a richer stored value.
        const patch = {};
        if (input.fullName && input.fullName !== existing.fullName)
            patch.fullName = input.fullName;
        if (input.email && !existing.email)
            patch.email = input.email;
        if (Object.keys(patch).length)
            await existing.update(patch, { transaction: t });
        return existing;
    }
    return models_1.Customer.create({
        fullName: input.fullName,
        phone,
        email: input.email ?? null,
    }, t ? { transaction: t } : undefined);
}
/** Stable display code CUS-0001 — a reference, never a security credential. */
async function ensureCustomerCode(customer) {
    if (customer.customerCode)
        return customer.customerCode;
    const padded = String(customer.id).padStart(4, '0');
    const candidate = `CUS-${padded}`;
    if (!(await models_1.Customer.findOne({ where: { customerCode: candidate } }))) {
        await customer.update({ customerCode: candidate });
        return candidate;
    }
    // Collision fallback (imported data etc.) — keep counting up.
    for (let n = customer.id + 1;; n += 1) {
        const next = `CUS-${String(n).padStart(4, '0')}`;
        if (!(await models_1.Customer.findOne({ where: { customerCode: next } }))) {
            await customer.update({ customerCode: next });
            return next;
        }
    }
}
/** Backfills customerCode for every legacy customer lacking one. Idempotent. */
async function backfillCustomerCodes() {
    const missing = await models_1.Customer.findAll({ where: { customerCode: null } });
    for (const customer of missing) {
        await ensureCustomerCode(customer);
    }
    return missing.length;
}
/** Merges appointment/payment phone copies into normalized customer accounts. Idempotent. */
async function backfillCustomerLinks() {
    // 1. normalize every stored customer phone
    const customers = await models_1.Customer.findAll();
    const seen = new Map();
    let merged = 0;
    for (const customer of customers) {
        const phone = (0, phone_1.normalizeNigerianPhone)(customer.phone);
        if (phone !== customer.phone || seen.has(phone)) {
            const dup = seen.get(phone);
            if (dup) {
                // Two rows collapsed onto the same normalized phone: move appointments
                // and payments to the older account and retire the duplicate.
                await models_1.Appointment.update({ customerId: dup }, { where: { customerId: customer.id } });
                await models_1.Payment.update({ customerId: dup }, { where: { customerId: customer.id } });
                await customer.destroy();
                merged += 1;
                continue;
            }
            await customer.update({ phone });
        }
        seen.set(phone, customer.id);
    }
    // 2. link appointments that reference a known phone but have no customerId
    const unlinked = await models_1.Appointment.findAll({
        where: { customerId: null },
        attributes: ['id', 'customerName', 'customerPhone', 'customerEmail'],
    });
    for (const appointment of unlinked) {
        const phone = (0, phone_1.normalizeNigerianPhone)(appointment.customerPhone);
        const customer = (await models_1.Customer.findOne({ where: { phone } })) ??
            (await models_1.Customer.create({
                fullName: appointment.customerName,
                phone,
                email: appointment.customerEmail ?? null,
            }));
        await appointment.update({
            customerId: customer.id,
            customerPhone: phone,
            customerName: appointment.customerName || customer.fullName,
        });
    }
    // 3. same for payments without a customer link
    const orphanPayments = await models_1.Payment.findAll({
        where: { customerId: null },
        include: [{ model: models_1.Appointment, as: 'appointment', attributes: ['id', 'customerId'] }],
    });
    for (const payment of orphanPayments) {
        if (payment.appointment?.customerId) {
            await payment.update({ customerId: payment.appointment.customerId });
        }
    }
    await backfillCustomerCodes();
    return { customers: seen.size, appointments: unlinked.length };
}
async function getCustomerStats(customerId) {
    const appointments = await models_1.Appointment.findAll({
        where: { customerId },
        attributes: ['status'],
        include: [
            {
                model: models_1.Payment,
                as: 'payment',
                attributes: ['status', 'amount'],
                required: false,
            },
        ],
    });
    let completed = 0;
    let cancelled = 0;
    let pending = 0;
    let totalSpent = 0;
    for (const appointment of appointments) {
        const status = appointment.status;
        if (status === 'COMPLETED')
            completed += 1;
        else if (status === 'CANCELLED')
            cancelled += 1;
        else
            pending += 1;
        if (appointment.payment?.status === 'PAID') {
            totalSpent += Number(appointment.payment.amount);
        }
    }
    return { totalAppointments: appointments.length, completed, cancelled, pending, totalSpent };
}
async function listCustomers(query) {
    const page = Math.max(1, query.page || 1);
    const perPage = Math.min(100, Math.max(1, query.perPage || 20));
    const search = query.search?.trim();
    const normalized = search ? (0, phone_1.normalizeNigerianPhone)(search) : '';
    const where = {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(search
            ? {
                [sequelize_1.Op.or]: [
                    { fullName: { [sequelize_1.Op.like]: `%${search}%` } },
                    { phone: { [sequelize_1.Op.like]: `%${search}%` } },
                    { email: { [sequelize_1.Op.like]: `%${search}%` } },
                    { customerCode: { [sequelize_1.Op.like]: `%${search}%` } },
                    // Digit-only search matches normalized phone regardless of input format.
                    ...(normalized.length >= 3 ? [{ phone: { [sequelize_1.Op.like]: `%${normalized}%` } }] : []),
                ],
            }
            : {}),
    };
    const { rows, count } = await models_1.Customer.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        offset: (page - 1) * perPage,
        limit: perPage,
    });
    const items = await Promise.all(rows.map(async (customer) => {
        const stats = await getCustomerStats(customer.id);
        const last = await models_1.Appointment.findOne({
            where: { customerId: customer.id },
            order: [
                ['appointmentDate', 'DESC'],
                ['appointmentTime', 'DESC'],
            ],
            include: [
                { model: models_1.Payment, as: 'payment', attributes: ['status'] },
                { model: models_1.Service, as: 'service', attributes: ['id', 'name'] },
                { model: models_1.Barber, as: 'barber', attributes: ['id', 'name'] },
            ],
        });
        return {
            id: customer.id,
            customerCode: customer.customerCode ?? `CUS-${String(customer.id).padStart(4, '0')}`,
            fullName: customer.fullName,
            phone: customer.phone,
            email: customer.email,
            isActive: customer.isActive,
            createdAt: customer.createdAt,
            stats,
            lastVisit: last
                ? {
                    id: last.id,
                    date: last.appointmentDate,
                    status: last.status,
                    serviceName: last.service?.name ?? null,
                    barberName: last.barber?.name ?? null,
                }
                : null,
        };
    }));
    return { items, total: count, page, perPage };
}
//# sourceMappingURL=customerService.js.map