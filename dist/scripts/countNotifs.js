"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../models");
const database_1 = require("../config/database");
const models_1 = require("../models");
async function main() {
    await database_1.sequelize.authenticate();
    const total = await models_1.BarberNotification.count();
    const unread = await models_1.BarberNotification.count({ where: { readAt: null } });
    console.log(JSON.stringify({ total, unread }));
    await database_1.sequelize.close();
}
main();
//# sourceMappingURL=countNotifs.js.map