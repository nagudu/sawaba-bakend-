"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const sequelize_1 = require("sequelize");
async function migrate() {
    const cols = await database_1.sequelize.query(`SHOW COLUMNS FROM reviews`, { type: sequelize_1.QueryTypes.SELECT });
    const existing = new Set(cols.map((c) => c.Column_name));
    const additions = [
        { name: 'status', def: "ADD COLUMN `status` VARCHAR(10) NOT NULL DEFAULT 'PENDING'" },
        { name: 'customerPhone', def: 'ADD COLUMN `customer_phone` VARCHAR(32) NULL' },
        { name: 'customerEmail', def: 'ADD COLUMN `customer_email` VARCHAR(255) NULL' },
        { name: 'serviceId', def: 'ADD COLUMN `service_id` INT UNSIGNED NULL' },
        { name: 'serviceName', def: 'ADD COLUMN `service_name` VARCHAR(150) NULL' },
    ];
    for (const { name, def } of additions) {
        const snake = name.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (!existing.has(snake)) {
            await database_1.sequelize.query(`ALTER TABLE reviews ${def}`);
            console.log(`  Added ${snake}`);
        }
        else {
            console.log(`  ${snake} already exists, skipping`);
        }
    }
    await database_1.sequelize.query(`UPDATE reviews SET status = 'APPROVED' WHERE is_approved = 1`);
    console.log('  Backfilled status from is_approved');
    const indexes = await database_1.sequelize.query(`SHOW INDEX FROM reviews`, { type: sequelize_1.QueryTypes.SELECT });
    const indexNames = new Set(indexes.map((i) => i.Key_name));
    if (!indexNames.has('index_reviews_status')) {
        await database_1.sequelize.query(`ALTER TABLE reviews ADD INDEX index_reviews_status (\`status\`)`);
        console.log('  Added index on status');
    }
    else {
        console.log('  index_reviews_status already exists, skipping');
    }
    console.log('Migration complete.');
    await database_1.sequelize.close();
}
migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
//# sourceMappingURL=migrateReviewColumns.js.map