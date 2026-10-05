"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
async function main() {
    const [tables] = (await database_1.sequelize.query(`SHOW TABLES`));
    const tNames = tables.map((t) => Object.values(t)[0]);
    console.log('TABLES(' + tNames.length + '):', tNames.join(', '));
    for (const t of tNames) {
        const [cols] = (await database_1.sequelize.query(`SHOW COLUMNS FROM \`${t}\``));
        console.log('\n=== ' + t + ' ===\n' +
            cols
                .map((c) => `  ${c.Field}: ${c.Type}${c.Null === 'NO' ? ' NOT NULL' : ''}${c.Key ? ' [' + c.Key + ']' : ''}${c.Default !== null ? ' def=' + c.Default : ''}`)
                .join('\n'));
    }
    await database_1.sequelize.close();
}
main().catch(async (e) => { console.error(e); await database_1.sequelize.close(); process.exit(1); });
//# sourceMappingURL=_qaSchema.js.map