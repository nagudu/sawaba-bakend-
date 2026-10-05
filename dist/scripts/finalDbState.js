"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../models");
const database_1 = require("../config/database");
const models_1 = require("../models");
const sequelize_1 = require("sequelize");
async function main() {
    await database_1.sequelize.authenticate();
    const appts = await models_1.Appointment.findAll();
    console.log('appointments:', appts.map(a => `${a.id}:${a.customerName}`).join(' ; ') || 'none');
    const custs = await models_1.Customer.findAll({
        where: { [sequelize_1.Op.or]: [{ email: { [sequelize_1.Op.like]: 'qa%@test.local' } }, { fullName: { [sequelize_1.Op.like]: 'QA %' } }] },
    });
    console.log('qa customers remaining:', custs.map(c => `${c.id}:${c.email}`).join(',') || 'none');
    const pays = await models_1.Payment.findAll();
    const apptIds = new Set(appts.map(a => a.id));
    const orphans = pays.filter(p => !apptIds.has(p.appointmentId));
    console.log('orphan payments:', orphans.map(p => p.id).join(',') || 'none');
    await database_1.sequelize.close();
    process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
//# sourceMappingURL=finalDbState.js.map