"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = void 0;
exports.connectDatabase = connectDatabase;
exports.closeDatabase = closeDatabase;
const sequelize_1 = require("sequelize");
const env_1 = require("./env");
exports.sequelize = new sequelize_1.Sequelize(env_1.env.databaseUrl, {
    dialect: 'mysql',
    logging: env_1.env.nodeEnv === 'development' ? console.log : false,
    define: {
        underscored: true,
        freezeTableName: false,
        charset: 'utf8mb4',
    },
    // Hosted MySQL providers (Aiven, PlanetScale, Railway, etc.) terminate TLS.
    // Set DB_SSL=true in the deployed environment; local MySQL stays non-SSL.
    // Providers whose CA chain isn't publicly trusted (e.g. Railway) can relax
    // verification with DB_SSL_REJECT_UNAUTHORIZED=false — traffic stays encrypted.
    dialectOptions: process.env.DB_SSL === 'true'
        ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } }
        : undefined,
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
});
async function connectDatabase() {
    await exports.sequelize.authenticate();
}
async function closeDatabase() {
    await exports.sequelize.close();
}
//# sourceMappingURL=database.js.map