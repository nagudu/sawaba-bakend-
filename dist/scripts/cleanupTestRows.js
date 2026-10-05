"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const sequelize_1 = require("sequelize");
const database_1 = require("../config/database");
const models_1 = require("../models");
/**
 * One-off cleanup: removes the synthetic rows created by the availability
 * test battery and preview booking-flow tests ("Test …" / "Preview Flow Test").
 */
async function run() {
    await database_1.sequelize.authenticate();
    const like = (column) => database_1.sequelize.where(database_1.sequelize.col(column), { [sequelize_1.Op.like]: '%Test%' });
    const appointments = await models_1.Appointment.findAll({ where: like('customer_name') });
    const ids = appointments.map((a) => a.id);
    if (ids.length > 0) {
        await models_1.Payment.destroy({ where: { appointmentId: ids } });
        await models_1.Appointment.destroy({ where: { id: ids } });
    }
    const sessions = await models_1.CheckoutSession.destroy({ where: like('customer_name') });
    console.log(`cleaned: ${ids.length} appointments, ${sessions} sessions`);
    await database_1.sequelize.close();
}
void run().catch((error) => {
    console.error('cleanup failed:', error);
    process.exit(1);
});
//# sourceMappingURL=cleanupTestRows.js.map