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
        // The default interactive-transaction budget is 5s (maxWait 2s). On this
        // database a multi-statement payment update can exceed it and fail with
        // P2028 mid-flight, so give transactions room to commit.
        transactionOptions: {
            maxWait: 5000,
            timeout: 20000,
        },
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