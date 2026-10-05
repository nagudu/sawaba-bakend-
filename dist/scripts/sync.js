"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const models_1 = require("../models");
async function run() {
    try {
        await database_1.sequelize.authenticate();
        console.log('[db:sync] database connection established');
        await database_1.sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
        console.log('[db:sync] models synchronized');
        const [admin, created] = await models_1.Admin.findOrCreate({
            where: { email: env_1.env.adminSeed.email.toLowerCase() },
            defaults: {
                name: env_1.env.adminSeed.name,
                email: env_1.env.adminSeed.email.toLowerCase(),
                password: await bcryptjs_1.default.hash(env_1.env.adminSeed.password, 12),
                role: 'ADMIN',
            },
        });
        console.log(created
            ? `[db:sync] seed admin created: ${admin.email}`
            : `[db:sync] admin already exists: ${admin.email}`);
        await database_1.sequelize.close();
        console.log('[db:sync] done');
    }
    catch (error) {
        console.error('[db:sync] failed:', error);
        process.exitCode = 1;
    }
}
void run();
//# sourceMappingURL=sync.js.map