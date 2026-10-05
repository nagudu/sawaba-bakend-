"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const sequelize_1 = require("sequelize");
/**
 * One-off cleanup: deletes rows whose barber_id references a barber that no
 * longer exists. These orphans block `sequelize.sync({ alter: true })` from
 * re-validating foreign keys.
 */
async function run() {
    await database_1.sequelize.authenticate();
    const tables = [
        'barber_availability',
        'barber_services',
        'gallery',
        'reviews',
        'appointments',
    ];
    for (const table of tables) {
        const [exists] = await database_1.sequelize.query(`SHOW TABLES LIKE '${table}'`, { type: sequelize_1.QueryTypes.SELECT });
        if (!exists)
            continue;
        const deleted = await database_1.sequelize.query(`DELETE \`${table}\` FROM \`${table}\`
       LEFT JOIN \`barbers\` ON \`barbers\`.\`id\` = \`${table}\`.\`barber_id\`
       WHERE \`${table}\`.\`barber_id\` IS NOT NULL AND \`barbers\`.\`id\` IS NULL`);
        console.log(`[cleanup] ${table}: ${JSON.stringify(deleted[1])} orphan rows removed`);
    }
    await database_1.sequelize.close();
}
void run();
//# sourceMappingURL=cleanupOrphanBarberRows.js.map