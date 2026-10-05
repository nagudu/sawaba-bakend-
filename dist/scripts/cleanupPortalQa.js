"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../models");
const database_1 = require("../config/database");
const models_1 = require("../models");
const sequelize_1 = require("sequelize");
async function main() {
    await database_1.sequelize.authenticate();
    const appts = await models_1.Appointment.findAll({
        where: {
            [sequelize_1.Op.or]: [
                { customerName: { [sequelize_1.Op.like]: 'QA %' } },
                { customerEmail: { [sequelize_1.Op.like]: 'qa%@test.local' } },
                { customerEmail: { [sequelize_1.Op.like]: '%@sawaba.test' } },
                { appointmentDate: '2026-10-10' },
            ],
        },
    });
    console.log('QA appointments:', appts.map(a => a.id).join(',') || 'none');
    for (const a of appts) {
        await models_1.Payment.destroy({ where: { appointmentId: a.id } });
        await models_1.BarberEarning.destroy({ where: { appointmentId: a.id } });
        await a.destroy();
    }
    const custs = await models_1.Customer.findAll({
        where: {
            [sequelize_1.Op.or]: [
                { email: { [sequelize_1.Op.like]: 'qa%@gmail.com' } },
                { email: { [sequelize_1.Op.like]: 'qa%@test.local' } },
                { email: { [sequelize_1.Op.like]: '%@sawaba.test' } },
                { fullName: { [sequelize_1.Op.like]: 'QA %' } },
            ],
        },
    });
    for (const c of custs)
        await c.destroy();
    console.log('QA customers removed:', custs.length);
    const left = await models_1.Appointment.findAll();
    console.log('appointments remaining:', left.map(a => `${a.id}:${a.customerName}`).join(' ; ') || 'none');
    await database_1.sequelize.close();
    process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
//# sourceMappingURL=cleanupPortalQa.js.map