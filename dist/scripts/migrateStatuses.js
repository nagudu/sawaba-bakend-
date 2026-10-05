"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const promise_1 = __importDefault(require("mysql2/promise"));
/**
 * Migrate appointment statuses:
 *   '' / NULL        → PAYMENT_REQUIRED
 *   PENDING_PAYMENT  → PAYMENT_REQUIRED
 *   PAYMENT_VERIFICATION → PAYMENT_SUBMITTED
 *   CONFIRMED        → READY_FOR_SERVICE
 *
 * Uses a 3-phase approach:
 *   1. Widen column to VARCHAR so UPDATE can accept new enum values
 *   2. Remap all rows
 *   3. Tighten back to the new ENUM
 */
async function run() {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL)
        throw new Error('DATABASE_URL is required');
    const conn = await promise_1.default.createConnection(DATABASE_URL);
    console.log('[migrate] connected');
    // Phase 1: widen ENUM → VARCHAR so arbitrary strings are accepted
    await conn.execute("ALTER TABLE appointments MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PAYMENT_REQUIRED'");
    console.log('[migrate] status widened to VARCHAR(30)');
    // Phase 2: remap values (order matters: fix empties first, then rename old values)
    await conn.execute("UPDATE appointments SET status = 'PAYMENT_REQUIRED' WHERE status = '' OR status IS NULL");
    console.log('[migrate] empty/null → PAYMENT_REQUIRED');
    await conn.execute("UPDATE appointments SET status = 'PAYMENT_REQUIRED' WHERE status = 'PENDING_PAYMENT'");
    console.log('[migrate] PENDING_PAYMENT → PAYMENT_REQUIRED');
    await conn.execute("UPDATE appointments SET status = 'PAYMENT_SUBMITTED' WHERE status = 'PAYMENT_VERIFICATION'");
    console.log('[migrate] PAYMENT_VERIFICATION → PAYMENT_SUBMITTED');
    await conn.execute("UPDATE appointments SET status = 'READY_FOR_SERVICE' WHERE status = 'CONFIRMED'");
    console.log('[migrate] CONFIRMED → READY_FOR_SERVICE');
    // Phase 3: verify no invalid values remain
    const [remaining] = await conn.execute("SELECT DISTINCT status FROM appointments WHERE status NOT IN ('PAYMENT_REQUIRED','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','PAYMENT_REJECTED','READY_FOR_SERVICE','IN_PROGRESS','COMPLETED','CANCELLED')");
    const bad = remaining;
    if (bad.length > 0) {
        console.error('[migrate] FATAL: unexpected status values still present:', bad.map((r) => r.status));
        process.exit(1);
    }
    // Phase 4: tighten back to new ENUM
    await conn.execute("ALTER TABLE appointments MODIFY COLUMN status ENUM('PAYMENT_REQUIRED','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','PAYMENT_REJECTED','READY_FOR_SERVICE','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PAYMENT_REQUIRED'");
    console.log('[migrate] status tightened back to new ENUM');
    // Show final state
    const [final] = await conn.execute('SELECT id, reference_code, status FROM appointments ORDER BY id');
    console.log('[migrate] final statuses:', final);
    await conn.end();
    console.log('[migrate] done');
}
void run();
//# sourceMappingURL=migrateStatuses.js.map