"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const models_1 = require("../models");
/** One-off: remove TEST barbers + their earnings from the battery runs. */
async function run() {
    await database_1.sequelize.authenticate();
    const barbers = await models_1.Barber.findAll({ where: { name: { [sequelize_1.Op.like]: 'TEST-%' } } });
    const ids = barbers.map((b) => b.id);
    if (ids.length > 0) {
        await models_1.BarberEarning.destroy({ where: { barberId: ids } });
        for (const b of barbers)
            await b.destroy();
    }
    console.log(`removed ${ids.length} test barbers: [${ids.join(', ')}]`);
    await database_1.sequelize.close();
}
void run().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=cleanupTestBarbers.js.map