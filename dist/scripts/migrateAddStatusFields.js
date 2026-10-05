"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const sequelize_1 = require("sequelize");
async function migrate() {
    const cols = await database_1.sequelize.query(`SHOW COLUMNS FROM appointments`, { type: sequelize_1.QueryTypes.SELECT });
    const existing = new Set(cols.map((c) => c.Column_name));
    const additions = [
        { name: 'serviceStartedAt', def: 'ADD COLUMN `service_started_at` DATETIME NULL' },
        { name: 'completedAt', def: 'ADD COLUMN `completed_at` DATETIME NULL' },
        { name: 'cancelledAt', def: 'ADD COLUMN `cancelled_at` DATETIME NULL' },
        { name: 'cancellationReason', def: 'ADD COLUMN `cancellation_reason` TEXT NULL' },
        { name: 'cancelledBy', def: 'ADD COLUMN `cancelled_by` INT UNSIGNED NULL' },
    ];
    for (const { name, def } of additions) {
        const snake = name.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (!existing.has(snake)) {
            await database_1.sequelize.query(`ALTER TABLE appointments ${def}`);
            console.log(`  Added ${snake}`);
        }
        else {
            console.log(`  ${snake} already exists, skipping`);
        }
    }
    console.log('Migration complete.');
    await database_1.sequelize.close();
}
migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
//# sourceMappingURL=migrateAddStatusFields.js.map