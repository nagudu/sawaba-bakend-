"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.connectPrisma = connectPrisma;
exports.closePrisma = closePrisma;
const adapter_mariadb_1 = require("@prisma/adapter-mariadb");
const client_1 = require("../generated/prisma/client");
const env_1 = require("./env");
/**
 * Prisma ORM v7 requires a driver adapter: the connection URL lives in
 * prisma.config.ts for the CLI, and the client is handed the same URL here
 * through @prisma/adapter-mariadb (which speaks the `mariadb` driver, matching
 * the MariaDB instance this project runs on).
 */
function poolConfig(databaseUrl) {
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const port = url.port ? Number(url.port) : 3306;
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    // Hosted providers (Railway, Aiven, PlanetScale) terminate TLS in transit.
    // Set DB_SSL=true in the deployed environment; local MariaDB stays non-SSL.
    // Providers whose CA chain is not publicly trusted can relax verification with
    // DB_SSL_REJECT_UNAUTHORIZED=false — traffic stays encrypted either way.
    const ssl = process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined;
    return {
        host,
        port,
        user,
        password,
        database,
        ...(ssl ? { ssl } : {}),
        charset: 'utf8mb4',
        // Mirrors the pool that config/database.ts configured for Sequelize.
        connectionLimit: 10,
        connectTimeout: 30_000,
        idleTimeout: 10_000,
    };
}
// One client for the whole process. In dev, tsx reloads modules on change, so
// cache on globalThis to stop each reload from opening a fresh connection pool.
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        adapter: new adapter_mariadb_1.PrismaMariaDb(poolConfig(env_1.env.databaseUrl)),
        log: env_1.env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
    });
if (env_1.env.nodeEnv !== 'production')
    globalForPrisma.prisma = exports.prisma;
async function connectPrisma() {
    await exports.prisma.$queryRaw `SELECT 1`;
}
async function closePrisma() {
    await exports.prisma.$disconnect();
}
//# sourceMappingURL=prisma.js.map