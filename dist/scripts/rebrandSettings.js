"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* One-off: rebrand the live payment_settings row from "Salon" to "Studio".
 * Run: cd backend && npx tsx src/scripts/rebrandSettings.ts
 */
const models_1 = require("../models");
const database_1 = require("../config/database");
async function run() {
    await database_1.sequelize.authenticate();
    const settings = await models_1.PaymentSetting.findByPk(1);
    if (!settings) {
        console.log('[rebrand] no payment_settings row found — nothing to do');
        return;
    }
    const updates = {};
    for (const field of ['shopName', 'accountName', 'opayAccountName']) {
        const current = settings.get(field);
        if (typeof current === 'string' && current.includes('Grooming Salon')) {
            updates[field] = current.replace(/Grooming Salon/g, 'Grooming Studio');
        }
    }
    if (Object.keys(updates).length === 0) {
        console.log('[rebrand] settings already use "Grooming Studio" — nothing to do');
        return;
    }
    await settings.update(updates);
    console.log('[rebrand] updated fields:', Object.keys(updates).join(', '));
    await database_1.sequelize.close();
}
run().catch((error) => {
    console.error('[rebrand] failed:', error.message);
    process.exit(1);
});
//# sourceMappingURL=rebrandSettings.js.map