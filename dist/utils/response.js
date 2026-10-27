"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successRes = successRes;
exports.errorRes = errorRes;
exports.getPagination = getPagination;
const prismaSerialize_1 = require("./prismaSerialize");
function successRes(res, message, data, status = 200) {
    // Normalises Prisma values (Decimal, @db.Date) into the exact shapes Sequelize
    // produced, so the frontend sees an unchanged API contract during the migration.
    res.status(status).json({ success: true, message, data: (0, prismaSerialize_1.serializePrisma)(data) });
}
function errorRes(res, message, status = 400) {
    res.status(status).json({ success: false, message });
}
function getPagination(query) {
    const page = Math.max(1, Number(query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 20));
    return { page, perPage, offset: (page - 1) * perPage, limit: perPage };
}
//# sourceMappingURL=response.js.map