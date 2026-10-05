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
exports.getCustomerDetail = getCustomerDetail;
exports.adminUpdateCustomer = adminUpdateCustomer;
exports.sendDueReminders = sendDueReminders;
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const appointmentService_1 = require("./appointmentService");
const customerService_1 = require("./customerService");
const mailer_1 = require("./mailer");
/** Full customer bundle for the admin Customers page. */
async function getCustomerDetail(id) {
    const customer = await models_1.Customer.findByPk(id);
    if (!customer)
        throw new errors_1.NotFoundError('Customer not found.');
    const [appointments, stats] = await Promise.all([
        models_1.Appointment.findAll({
            where: { customerId: id },
            include: [
                { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Service, as: 'service', attributes: ['id', 'name', 'price', 'duration'] },
                { model: (await Promise.resolve().then(() => __importStar(require('../models')))).Barber, as: 'barber', attributes: ['id', 'name', 'image'] },
                { model: models_1.Payment, as: 'payment', attributes: ['id', 'status', 'amount', 'paymentMethod', 'accessToken'] },
            ],
            order: [
                ['appointmentDate', 'DESC'],
                ['appointmentTime', 'DESC'],
            ],
            limit: 200,
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
/** Admin edits — never phone (identity anchor) or spend data. */
async function adminUpdateCustomer(id, patch) {
    const customer = await models_1.Customer.findByPk(id);
    if (!customer)
        throw new errors_1.NotFoundError('Customer not found.');
    const fields = {};
    if (patch.fullName !== undefined && patch.fullName.trim())
        fields.fullName = patch.fullName.trim();
    if (patch.email !== undefined) {
        const email = patch.email ? patch.email.trim().toLowerCase() : null;
        if (email && email !== customer.email) {
            const taken = await models_1.Customer.findOne({ where: { email } });
            if (taken)
                throw new errors_1.UnprocessableError('This email belongs to another customer.');
        }
        fields.email = email;
    }
    if (patch.isActive !== undefined)
        fields.isActive = patch.isActive;
    if (patch.reminderOptIn !== undefined)
        fields.reminderOptIn = patch.reminderOptIn;
    await customer.update(fields);
    return customer;
}
/**
 * Sends the "book your usual" nudge to customers whose average visit gap has
 * elapsed since their last appointment. Never auto-books; opt-out respected.
 */
async function sendDueReminders(options = {}) {
    const customers = await models_1.Customer.findAll({ where: { isActive: true, reminderOptIn: true } });
    const today = new Date();
    const results = [];
    let skipped = 0;
    for (const customer of customers) {
        const appointments = await models_1.Appointment.findAll({
            where: { customerId: customer.id, status: { [sequelize_1.Op.ne]: 'CANCELLED' } },
            attributes: ['appointmentDate', 'serviceId'],
            order: [['appointmentDate', 'ASC']],
        });
        if (appointments.length < 2) {
            skipped += 1;
            continue;
        }
        // Average gap in days between consecutive visits.
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
        // Due when the customer is within 2 days of their average rebooking rhythm.
        if (daysSince < avgGap - 2 || !customer.email) {
            skipped += 1;
            continue;
        }
        const last = appointments[appointments.length - 1];
        const service = await (await Promise.resolve().then(() => __importStar(require('../models')))).Service.findByPk(last.serviceId, {
            attributes: ['name'],
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