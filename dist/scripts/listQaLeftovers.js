"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../models");
const database_1 = require("../config/database");
const models_1 = require("../models");
const sequelize_1 = require("sequelize");
async function main() {
    await database_1.sequelize.authenticate();
    const revs = await models_1.Review.findAll({});
    console.log('all reviewers:', revs.map(r => `${r.id}:${r.customerName}:${r.status ?? r.getDataValue('status')}`).join(' ; ') || 'none');
    const custs = await models_1.Customer.findAll({ where: { email: { [sequelize_1.Op.like]: 'qa%' } } });
    console.log('qa customers:', custs.map(c => c.email).join(',') || 'none');
    await database_1.sequelize.close();
    process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
//# sourceMappingURL=listQaLeftovers.js.map