"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Adds Barber Portal identity columns to `barbers`:
 *   password_hash  VARCHAR(255) NULL      — bcrypt hash, admin-issued
 *   portal_enabled TINYINT(1) NOT NULL 0  — whether the barber may sign in
 *
 * Idempotent — safe to run repeatedly. Other columns (barber_type, location,
 * commission_*, phone, email) already exist via prior migrations/sync.
 */
const database_1 = require("../config/database");
async function columnExists(table, column) {
    const [rows] = await database_1.sequelize.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`, { replacements: { table, column } });
    return rows.length > 0;
}
async function migrate() {
    if (!(await columnExists('barbers', 'password_hash'))) {
        await database_1.sequelize.query('ALTER TABLE `barbers` ADD COLUMN `password_hash` VARCHAR(255) NULL AFTER `is_active`');
        console.log('✓ added barbers.password_hash');
    }
    else {
        console.log('· barbers.password_hash already present');
    }
    if (!(await columnExists('barbers', 'portal_enabled'))) {
        await database_1.sequelize.query('ALTER TABLE `barbers` ADD COLUMN `portal_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `password_hash`');
        console.log('✓ added barbers.portal_enabled');
    }
    else {
        console.log('· barbers.portal_enabled already present');
    }
}
migrate()
    .then(async () => {
    await database_1.sequelize.close();
    console.log('Barber portal columns migration complete.');
})
    .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
});
//# sourceMappingURL=migrateBarberPortalColumns.js.map