"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1 gate: the introspected Prisma schema must agree with the live database
 * and with Sequelize on every table, before any application code is migrated.
 *
 *   npx tsx src/scripts/prismaParity.ts
 *
 * Per table: row counts match, and the 3 lowest-id rows are field-for-field
 * identical through both ORMs.
 */
const adapter_mariadb_1 = require("@prisma/adapter-mariadb");
const client_1 = require("../generated/prisma/client");
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const models_1 = require("../models");
const url = new URL(env_1.env.databaseUrl);
const adapter = new adapter_mariadb_1.PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    charset: 'utf8mb4',
    connectionLimit: 2,
});
const prisma = new client_1.PrismaClient({ adapter, log: ['error'] });
const TABLES = [
    { prisma: 'admin', model: models_1.Admin },
    { prisma: 'appointment', model: models_1.Appointment },
    { prisma: 'barberAssignmentHistory', model: models_1.BarberAssignmentHistory },
    { prisma: 'barberAvailability', model: models_1.BarberAvailability },
    { prisma: 'barberEarning', model: models_1.BarberEarning },
    { prisma: 'barberNotification', model: models_1.BarberNotification },
    { prisma: 'barberService', model: models_1.BarberService },
    { prisma: 'barber', model: models_1.Barber },
    { prisma: 'checkoutSession', model: models_1.CheckoutSession },
    { prisma: 'commissionRateHistory', model: models_1.CommissionRateHistory },
    { prisma: 'contactMessage', model: models_1.ContactMessage },
    { prisma: 'contactReply', model: models_1.ContactReply },
    { prisma: 'customerOtp', model: models_1.CustomerOtp },
    { prisma: 'customer', model: models_1.Customer },
    { prisma: 'gallery', model: models_1.Gallery },
    { prisma: 'paymentSetting', model: models_1.PaymentSetting },
    { prisma: 'payment', model: models_1.Payment },
    { prisma: 'review', model: models_1.Review },
    { prisma: 'service', model: models_1.Service },
];
/** Normalise so Decimal / BigInt / Date / JSON differences don't read as drift. */
function canon(v) {
    if (v === null || v === undefined)
        return null;
    if (v instanceof Date)
        return v.toISOString();
    if (typeof v === 'bigint')
        return Number(v);
    if (Array.isArray(v))
        return v.map(canon);
    if (typeof v === 'object') {
        const o = v;
        if (typeof o.toFixed === 'function')
            return Number(o.toString());
        const out = {};
        // Key casing differs by design: Prisma fields are @map'd to camelCase to
        // match Sequelize, so compare on a normalised camelCase key.
        for (const k of Object.keys(o).sort()) {
            const nk = k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
            out[nk] = canon(o[k]);
        }
        return out;
    }
    return v;
}
/** Report exactly which keys differ between the two shapes, per row. */
function keyDiffs(p, s, path = '') {
    if (p === s)
        return [];
    const bothObjects = p && s && typeof p === 'object' && typeof s === 'object' && !Array.isArray(p) && !Array.isArray(s);
    if (!bothObjects)
        return [`${path || '<value>'}: prisma=${JSON.stringify(p)} sequelize=${JSON.stringify(s)}`];
    const keys = new Set([...Object.keys(p), ...Object.keys(s)]);
    const out = [];
    for (const k of keys) {
        const pv = p[k];
        const sv = s[k];
        if (JSON.stringify(pv) === JSON.stringify(sv))
            continue;
        out.push(...keyDiffs(pv, sv, path ? `${path}.${k}` : k));
    }
    return out;
}
async function main() {
    await database_1.sequelize.authenticate();
    let failed = 0;
    const out = [];
    for (const { prisma: pm, model: rawModel } of TABLES) {
        const model = rawModel;
        const label = model.name;
        try {
            const delegate = prisma[pm];
            if (!delegate)
                throw new Error(`no prisma delegate "${pm}"`);
            const pc = await delegate.count();
            const sc = await model.count();
            const pRows = await delegate.findMany({ orderBy: { id: 'asc' }, take: 3 });
            const sRows = (await model.findAll({ order: [['id', 'ASC']], limit: 3 })).map((r) => r.toJSON());
            const pJson = pRows.map((r) => JSON.stringify(canon(r)));
            const sJson = sRows.map((r) => JSON.stringify(canon(r)));
            const rowsOk = pJson.length === sJson.length && pJson.every((v, i) => v === sJson[i]);
            if (pc !== sc || !rowsOk) {
                failed++;
                out.push(`  FAIL ${label.padEnd(26)} prisma=${pc} sequelize=${sc}`);
                for (let i = 0; i < Math.max(pRows.length, sRows.length); i++) {
                    const diffs = keyDiffs(canon(pRows[i]), canon(sRows[i]));
                    for (const d of diffs.slice(0, 4))
                        out.push(`       row#${i} ${d}`);
                }
            }
            else {
                out.push(`  ok   ${label.padEnd(26)} rows=${pc}`);
            }
        }
        catch (e) {
            failed++;
            out.push(`  ERR  ${label.padEnd(26)} ${e.message.split('\n')[0]}`);
        }
    }
    console.log('\n=== prisma vs sequelize parity ===');
    for (const l of out)
        console.log(l);
    console.log(`\n${TABLES.length - failed}/${TABLES.length} tables agree`);
    if (failed)
        console.log('PARITY FAILED — do not migrate application code yet');
    await prisma.$disconnect();
    await database_1.sequelize.close();
    process.exit(failed ? 1 : 0);
}
void main();
//# sourceMappingURL=prismaParity.js.map