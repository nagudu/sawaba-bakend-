"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Read-only audit: which customer records share a phone number, and do the
 * bookings under one record belong to different identities (name/email)?
 * Run from backend/: npx tsx src/scripts/sharedPhoneAudit.ts
 */
const database_1 = require("../config/database");
async function main() {
    const customers = await database_1.prisma.customer.findMany({
        select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            passwordHash: true,
            googleSub: true,
            lastLoginAt: true,
            createdAt: true,
        },
        orderBy: { id: 'asc' },
    });
    const byPhone = new Map();
    for (const c of customers) {
        const key = c.phone.replace(/\D/g, '').slice(-10);
        const list = byPhone.get(key) ?? [];
        list.push(c);
        byPhone.set(key, list);
    }
    const report = [];
    for (const [phone, records] of byPhone) {
        if (records.length < 2 && !records.some((r) => r.passwordHash || r.googleSub))
            continue;
        for (const record of records) {
            const appointments = await database_1.prisma.appointment.findMany({
                where: { customerId: record.id },
                select: {
                    id: true,
                    referenceCode: true,
                    customerName: true,
                    customerEmail: true,
                    customerId: true,
                },
                orderBy: { id: 'asc' },
            });
            const identities = new Set(appointments.map((a) => `${(a.customerName ?? '').trim().toLowerCase()} <${(a.customerEmail ?? '').trim().toLowerCase()}>`));
            if (appointments.length > 0 && (identities.size > 1 || records.length > 1)) {
                report.push({
                    phone,
                    customerRecord: { id: record.id, name: record.fullName, email: record.email },
                    isAccount: Boolean(record.passwordHash || record.googleSub || record.lastLoginAt),
                    appointmentCount: appointments.length,
                    distinctIdentities: [...identities],
                    appointments: appointments.map((a) => ({
                        ref: a.referenceCode,
                        name: a.customerName,
                        email: a.customerEmail,
                    })),
                });
            }
        }
    }
    console.log(JSON.stringify(report, null, 2));
}
main()
    .catch((error) => {
    console.error('audit failed:', error);
    process.exitCode = 1;
})
    .finally(() => database_1.prisma.$disconnect());
//# sourceMappingURL=sharedPhoneAudit.js.map