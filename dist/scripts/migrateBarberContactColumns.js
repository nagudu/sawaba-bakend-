"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const sequelize_1 = require("sequelize");
async function migrate() {
    const cols = await database_1.sequelize.query(`SHOW COLUMNS FROM barbers`, { type: sequelize_1.QueryTypes.SELECT });
    const existing = new Set(cols.map((c) => c.Column_name));
    const additions = [
        { name: 'phone', def: 'ADD COLUMN `phone` VARCHAR(32) NULL' },
        { name: 'email', def: 'ADD COLUMN `email` VARCHAR(255) NULL' },
    ];
    for (const { name, def } of additions) {
        if (!existing.has(name)) {
            await database_1.sequelize.query(`ALTER TABLE barbers ${def}`);
            console.log(`  Added ${name}`);
        }
        else {
            console.log(`  ${name} already exists, skipping`);
        }
    }
    console.log('Migration complete.');
    await database_1.sequelize.close();
}
migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
//# sourceMappingURL=migrateBarberContactColumns.js.map