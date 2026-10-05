"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const database_1 = require("../config/database");
/** Verifies the internal/external barber schema migration landed. */
async function run() {
    await database_1.sequelize.authenticate();
    const qi = database_1.sequelize.getQueryInterface();
    const barberCols = await qi.describeTable('barbers');
    console.log('ALL BARBER COLS:', Object.keys(barberCols).join(','));
    const apptCols = await qi.describeTable('appointments');
    console.log('ALL APPT COLS:', Object.keys(apptCols).join(','));
    console.log('barber_earnings:', await qi.describeTable('barber_earnings').then(() => 'OK').catch(() => 'MISSING'));
    console.log('barber_assignment_history:', await qi.describeTable('barber_assignment_history').then(() => 'OK').catch(() => 'MISSING'));
    await database_1.sequelize.close();
}
void run().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=verifyBarberSchema.js.map