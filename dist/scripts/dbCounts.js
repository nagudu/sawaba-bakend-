"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const sequelize_1 = require("sequelize");
async function run() {
    await database_1.sequelize.authenticate();
    const count = async (sql) => {
        const rows = (await database_1.sequelize.query(sql, { type: sequelize_1.QueryTypes.SELECT }));
        return Number(rows[0]?.n ?? 0);
    };
    const result = {
        appointments: await count('SELECT COUNT(*) AS n FROM appointments'),
        payments: await count('SELECT COUNT(*) AS n FROM payments'),
        checkoutSessions: await count('SELECT COUNT(*) AS n FROM checkout_sessions'),
        openSessions: await count("SELECT COUNT(*) AS n FROM checkout_sessions WHERE status IN ('OPEN','AWAITING_PAYMENT')"),
    };
    console.log(JSON.stringify(result));
    await database_1.sequelize.close();
}
void run();
//# sourceMappingURL=dbCounts.js.map