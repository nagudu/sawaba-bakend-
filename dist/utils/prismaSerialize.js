"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializePrisma = serializePrisma;
const client_1 = require("@prisma/client");
const prismaFieldTypes_1 = require("../config/prismaFieldTypes");
/**
 * Normalises Prisma values into the exact JSON shapes Sequelize produced, so the
 * migration is behaviour-neutral for the React frontend:
 *
 *  - Prisma.Decimal            -> "500.00"  (Decimal drops the DECIMAL(p,s) scale)
 *  - @db.Date Date             -> "2026-09-25"  (Date JSON-serialises to a full ISO stamp)
 *
 * @db.DateTime columns are deliberately left as Date: both ORMs emit the same
 * ISO timestamp for them.
 */
function serializePrisma(value) {
    return walk(value);
}
function walk(value, key) {
    if (value === null || value === undefined)
        return value;
    // Binary payloads (uploaded receipts, exports) must survive untouched.
    if (Buffer.isBuffer(value))
        return value;
    if (value instanceof client_1.Prisma.Decimal) {
        const raw = key ? prismaFieldTypes_1.DECIMAL_SCALE[key] : undefined;
        const scale = typeof raw === 'number' ? raw : 2;
        return value.toFixed(scale);
    }
    if (value instanceof Date) {
        return key && prismaFieldTypes_1.DATE_ONLY_FIELDS.has(key) ? value.toISOString().slice(0, 10) : value;
    }
    if (Array.isArray(value))
        return value.map((v) => walk(v, key));
    if (typeof value === 'object') {
        const source = value;
        const out = {};
        for (const [k, v] of Object.entries(source))
            out[k] = walk(v, k);
        return out;
    }
    return value;
}
//# sourceMappingURL=prismaSerialize.js.map