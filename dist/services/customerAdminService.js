"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerDetail = getCustomerDetail;
exports.adminUpdateCustomer = adminUpdateCustomer;
exports.sendDueReminders = sendDueReminders;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const appointmentService_1 = require("./appointmentService");
const customerService_1 = require("./customerService");
const mailer_1 = require("./mailer");
async function getCustomerDetail(id) {
    const customer = await database_1.prisma.customer.findUnique({ where: { id } });
    if (!customer)
        throw new errors_1.NotFoundError('Customer not found.');
    const [appointments, stats] = await Promise.all([
        database_1.prisma.appointment.findMany({
            where: { customerId: id },
            include: {
                service: { select: { id: true, name: true, price: true, duration: true } },
                barber: { select: { id: true, name: true, image: true } },
                assignedBarber: { select: { id: true, name: true, image: true, barberType: true, location: true } },
                payment: { select: { id: true, status: true, amount: true, paymentMethod: true, accessToken: true } },
            },
            orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
            take: 200,
        }),
        (0, customerService_1.getCustomerStats)(id),
    ]);
    const serialized = appointments.map(appointmentService_1.serializeAppointment);
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().slice(0, 5);
    const upcoming = serialized.find((a) => a.status !== 'COMPLETED' &&
        a.status !== 'CANCELLED' &&
        (a.appointmentDate > today || (a.appointmentDate === today && a.appointmentTime >= now)));
    const serviceCounts = new Map();
    for (const appointment of appointments) {
        if (!appointment.service)
            continue;
        const entry = serviceCounts.get(appointment.serviceId);
        if (entry)
            entry.count += 1;
        else
            serviceCounts.set(appointment.serviceId, { name: appointment.service.name, count: 1 });
    }
    const favoriteServices = [...serviceCounts.entries()]
        .map(([serviceId, value]) => ({ serviceId, ...value }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    return {
        customer: {
            id: customer.id,
            customerCode: customer.customerCode ?? `CUS-${String(customer.id).padStart(4, '0')}`,
            fullName: customer.fullName,
            phone: customer.phone,
            email: customer.email,
            avatarUrl: customer.avatarUrl,
            reminderOptIn: customer.reminderOptIn,
            isActive: customer.isActive,
            createdAt: customer.createdAt,
            lastLoginAt: customer.lastLoginAt,
        },
        stats,
        upcoming: upcoming ?? null,
        appointments: serialized,
        favoriteServices,
    };
}
async function adminUpdateCustomer(id, patch) {
    const customer = await database_1.prisma.customer.findUnique({ where: { id } });
    if (!customer)
        throw new errors_1.NotFoundError('Customer not found.');
    const fields = {};
    if (patch.fullName !== undefined && patch.fullName.trim())
        fields.fullName = patch.fullName.trim();
    if (patch.email !== undefined) {
        const email = patch.email ? patch.email.trim().toLowerCase() : null;
        if (email && email !== customer.email) {
            const taken = await database_1.prisma.customer.findFirst({ where: { email } });
            if (taken)
                throw new errors_1.UnprocessableError('This email belongs to another customer.');
        }
        fields.email = email;
    }
    if (patch.isActive !== undefined)
        fields.isActive = patch.isActive;
    if (patch.reminderOptIn !== undefined)
        fields.reminderOptIn = patch.reminderOptIn;
    return database_1.prisma.customer.update({
        where: { id },
        data: fields,
    });
}
async function sendDueReminders(options = {}) {
    const customers = await database_1.prisma.customer.findMany({ where: { isActive: true, reminderOptIn: true } });
    const today = new Date();
    const results = [];
    let skipped = 0;
    for (const customer of customers) {
        const appointments = await database_1.prisma.appointment.findMany({
            where: { customerId: customer.id, status: { not: 'CANCELLED' } },
            select: { appointmentDate: true, serviceId: true },
            orderBy: { appointmentDate: 'asc' },
        });
        if (appointments.length < 2) {
            skipped += 1;
            continue;
        }
        const dates = appointments
            .map((a) => new Date(`${a.appointmentDate}T12:00:00`).getTime())
            .sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < dates.length; i += 1) {
            gaps.push((dates[i] - dates[i - 1]) / 86_400_000);
        }
        const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
        const lastVisit = dates[dates.length - 1];
        const daysSince = (today.getTime() - lastVisit) / 86_400_000;
        if (daysSince < avgGap - 2 || !customer.email) {
            skipped += 1;
            continue;
        }
        const last = appointments[appointments.length - 1];
        const service = await database_1.prisma.service.findUnique({
            where: { id: last.serviceId },
            select: { name: true },
        });
        const firstName = customer.fullName.split(' ')[0];
        if (!options.dryRun) {
            await (0, mailer_1.sendEmail)({
                to: customer.email,
                subject: `Hi ${firstName} 👋 Time for your next grooming session?`,
                text: `Hello ${firstName},\n\nIt's almost time for your next grooming session — your usual${service ? ` ${service.name}` : ' service'} awaits. Would you like to book again?\n\nBook in seconds at our website, or just reply to this email.\n\nSAWABA Grooming Studio`,
                html: `<p>Hello ${firstName} 👋</p><p>It's almost time for your next grooming session — your usual<strong>${service ? ` ${service.name}` : ' service'}</strong> awaits.</p><p>Would you like to book again? It only takes a few seconds.</p><p style="color:#888;font-size:12px;">You are receiving this because you opted into booking reminders. Manage this in your profile.</p>`,
            });
        }
        results.push({ customer: customer.fullName, phone: customer.phone, email: customer.email });
    }
    return { sent: results.length, skipped, results };
}
//# sourceMappingURL=customerAdminService.js.map