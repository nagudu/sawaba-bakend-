"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closePrisma = exports.connectPrisma = exports.prisma = void 0;
var database_1 = require("./database");
Object.defineProperty(exports, "prisma", { enumerable: true, get: function () { return database_1.prisma; } });
Object.defineProperty(exports, "connectPrisma", { enumerable: true, get: function () { return database_1.connectDatabase; } });
Object.defineProperty(exports, "closePrisma", { enumerable: true, get: function () { return database_1.closeDatabase; } });
//# sourceMappingURL=prisma.js.map