"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
require("../models");
const customerService_1 = require("../services/customerService");
/**
 * One-off maintenance: normalizes customer phones, merges duplicate accounts,
 * links orphaned appointments/payments and stamps CUS-codes. Safe to re-run.
 * Usage: npm run db:backfill-customers
 */
async function run() {
    await database_1.sequelize.authenticate();
    const links = await (0, customerService_1.backfillCustomerLinks)();
    const codes = await (0, customerService_1.backfillCustomerCodes)();
    console.log(`[db:backfill-customers] accounts=${links.customers} linkedAppointments=${links.appointments} newCodes=${codes}`);
    await database_1.sequelize.close();
}
void run().catch((error) => {
    console.error('[db:backfill-customers] failed:', error);
    process.exit(1);
});
//# sourceMappingURL=backfillCustomers.js.map