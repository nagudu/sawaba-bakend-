"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOrCreateCustomer = findOrCreateCustomer;
exports.ensureCustomerCode = ensureCustomerCode;
exports.backfillCustomerCodes = backfillCustomerCodes;
exports.backfillCustomerLinks = backfillCustomerLinks;
exports.getCustomerStats = getCustomerStats;
exports.listCustomers = listCustomers;
const database_1 = require("../config/database");
const phone_1 = require("../utils/phone");
const errors_1 = require("../utils/errors");
async function findOrCreateCustomer(input, tx) {
    const db = tx ?? database_1.prisma;
    const phone = (0, phone_1.normalizeNigerianPhone)(input.phone);
    if (!(0, phone_1.isPlausiblePhone)(phone)) {
        throw new errors_1.UnprocessableError('Provide a valid phone number.');
    }
    const existing = await db.customer.findFirst({ where: { phone } });
    if (existing) {
        const patch = {};
        if (input.fullName && input.fullName !== existing.fullName)
            patch.fullName = input.fullName;
        if (input.email && !existing.email)
            patch.email = input.email;
        if (Object.keys(patch).length > 0) {
            return db.customer.update({
                where: { id: existing.id },
                data: patch,
            });
        }
        return existing;
    }
    return db.customer.create({
        data: {
            fullName: input.fullName,
            phone,
            email: input.email ?? null,
        },
    });
}
async function ensureCustomerCode(customer, tx) {
    const db = tx ?? database_1.prisma;
    if (customer.customerCode)
        return customer.customerCode;
    const padded = String(customer.id).padStart(4, '0');
    const candidate = `CUS-${padded}`;
    const existing = await db.customer.findUnique({ where: { customerCode: candidate } });
    if (!existing) {
        await db.customer.update({
            where: { id: customer.id },
            data: { customerCode: candidate },
        });
        return candidate;
    }
    for (let n = customer.id + 1;; n += 1) {
        const next = `CUS-${String(n).padStart(4, '0')}`;
        const taken = await db.customer.findUnique({ where: { customerCode: next } });
        if (!taken) {
            await db.customer.update({
                where: { id: customer.id },
                data: { customerCode: next },
            });
            return next;
        }
    }
}
async function backfillCustomerCodes() {
    const missing = await database_1.prisma.customer.findMany({ where: { customerCode: null } });
    for (const customer of missing) {
        await ensureCustomerCode(customer);
    }
    return missing.length;
}
async function backfillCustomerLinks() {
    const customers = await database_1.prisma.customer.findMany();
    const seen = new Map();
    let merged = 0;
    for (const customer of customers) {
        const phone = (0, phone_1.normalizeNigerianPhone)(customer.phone);
        if (phone !== customer.phone || seen.has(phone)) {
            const dup = seen.get(phone);
            if (dup) {
                await database_1.prisma.appointment.updateMany({
                    where: { customerId: customer.id },
                    data: { customerId: dup },
                });
                await database_1.prisma.payment.updateMany({
                    where: { customerId: customer.id },
                    data: { customerId: dup },
                });
                await database_1.prisma.customer.delete({ where: { id: customer.id } });
                merged += 1;
                continue;
            }
            await database_1.prisma.customer.update({
                where: { id: customer.id },
                data: { phone },
            });
        }
        seen.set(phone, customer.id);
    }
    const unlinked = await database_1.prisma.appointment.findMany({
        where: { customerId: null },
        select: { id: true, customerName: true, customerPhone: true, customerEmail: true },
    });
    for (const appointment of unlinked) {
        const phone = (0, phone_1.normalizeNigerianPhone)(appointment.customerPhone);
        let customer = await database_1.prisma.customer.findFirst({ where: { phone } });
        if (!customer) {
            customer = await database_1.prisma.customer.create({
                data: {
                    fullName: appointment.customerName,
                    phone,
                    email: appointment.customerEmail ?? null,
                },
            });
        }
        await database_1.prisma.appointment.update({
            where: { id: appointment.id },
            data: {
                customerId: customer.id,
                customerPhone: phone,
                customerName: appointment.customerName || customer.fullName,
            },
        });
    }
    const orphanPayments = await database_1.prisma.payment.findMany({
        where: { customerId: null },
        include: { appointment: { select: { id: true, customerId: true } } },
    });
    for (const payment of orphanPayments) {
        if (payment.appointment?.customerId) {
            await database_1.prisma.payment.update({
                where: { id: payment.id },
                data: { customerId: payment.appointment.customerId },
            });
        }
    }
    await backfillCustomerCodes();
    return { customers: seen.size, appointments: unlinked.length };
}
async function getCustomerStats(customerId) {
    const appointments = await database_1.prisma.appointment.findMany({
        where: { customerId },
        select: {
            status: true,
            payment: {
                select: { status: true, amount: true },
            },
        },
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
    const where = {};
    if (!query.includeInactive) {
        where.isActive = true;
    }
    if (search) {
        where.OR = [
            { fullName: { contains: search } },
            { phone: { contains: search } },
            { email: { contains: search } },
            { customerCode: { contains: search } },
            ...(normalized.length >= 3 ? [{ phone: { contains: normalized } }] : []),
        ];
    }
    const [rows, count] = await Promise.all([
        database_1.prisma.customer.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * perPage,
            take: perPage,
        }),
        database_1.prisma.customer.count({ where }),
    ]);
    const items = await Promise.all(rows.map(async (customer) => {
        const stats = await getCustomerStats(customer.id);
        const last = await database_1.prisma.appointment.findFirst({
            where: { customerId: customer.id },
            orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
            include: {
                payment: { select: { status: true } },
                service: { select: { id: true, name: true } },
                barber: { select: { id: true, name: true } },
            },
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