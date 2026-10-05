"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../models");
const database_1 = require("../config/database");
const models_1 = require("../models");
const sequelize_1 = require("sequelize");
async function main() {
    await database_1.sequelize.authenticate();
    const reviews = await models_1.Review.findAll({ where: { customerName: 'QA Probe Reviewer' } });
    for (const r of reviews)
        await r.destroy();
    console.log('QA reviews removed:', reviews.length);
    const custs = await models_1.Customer.findAll({ where: { email: { [sequelize_1.Op.like]: 'qa%@test.local' } } });
    for (const c of custs)
        await c.destroy();
    console.log('QA customers removed:', custs.length);
    await database_1.sequelize.close();
    process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
//# sourceMappingURL=cleanupQaLeftovers.js.map