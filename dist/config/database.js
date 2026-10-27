"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.connectDatabase = connectDatabase;
exports.closeDatabase = closeDatabase;
const client_1 = require("@prisma/client");
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
async function connectDatabase() {
    await exports.prisma.$connect();
}
async function closeDatabase() {
    await exports.prisma.$disconnect();
}
exports.default = exports.prisma;
//# sourceMappingURL=database.js.map