"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const sequelize_1 = require("sequelize");
async function run() {
    await database_1.sequelize.authenticate();
    try {
        const rows = await database_1.sequelize.query('SELECT ba.id, ba.barber_id FROM barber_availabilities ba LEFT JOIN barbers b ON b.id = ba.barber_id WHERE b.id IS NULL', { type: sequelize_1.QueryTypes.SELECT });
        console.log('orphan availability rows:', JSON.stringify(rows));
    }
    catch (error) {
        console.log('orphan query failed:', error.message);
    }
    try {
        const created = await database_1.sequelize.query('SELECT COUNT(*) AS n FROM checkout_sessions', { type: sequelize_1.QueryTypes.SELECT });
        console.log('checkout_sessions count:', JSON.stringify(created));
    }
    catch (error) {
        console.log('checkout_sessions probe failed:', error.message);
    }
    await database_1.sequelize.close();
}
void run();
//# sourceMappingURL=diagAvailability.js.map