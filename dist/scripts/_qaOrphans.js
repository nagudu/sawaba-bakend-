"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const ORPHANS = [
    ['barber_availability -> barber', `SELECT COUNT(*) n FROM barber_availability a LEFT JOIN barbers b ON b.id=a.barber_id WHERE b.id IS NULL`],
    ['barber_services -> barber', `SELECT COUNT(*) n FROM barber_services s LEFT JOIN barbers b ON b.id=s.barber_id WHERE b.id IS NULL`],
    ['barber_services -> service', `SELECT COUNT(*) n FROM barber_services s LEFT JOIN services v ON v.id=s.service_id WHERE v.id IS NULL`],
    ['barber_earnings -> appointment', `SELECT COUNT(*) n FROM barber_earnings e LEFT JOIN appointments a ON a.id=e.appointment_id WHERE a.id IS NULL`],
    ['barber_earnings -> barber', `SELECT COUNT(*) n FROM barber_earnings e LEFT JOIN barbers b ON b.id=e.barber_id WHERE b.id IS NULL`],
    ['checkout_sessions -> appointment (dangling)', `SELECT COUNT(*) n FROM checkout_sessions c LEFT JOIN appointments a ON a.id=c.converted_appointment_id WHERE c.converted_appointment_id IS NOT NULL AND a.id IS NULL`],
    ['appointments -> customer (dangling)', `SELECT COUNT(*) n FROM appointments a LEFT JOIN customers c ON c.id=a.customer_id WHERE a.customer_id IS NOT NULL AND c.id IS NULL`],
    ['payments -> appointment (dangling)', `SELECT COUNT(*) n FROM payments p LEFT JOIN appointments a ON a.id=p.appointment_id WHERE a.id IS NULL`],
    ['assign_history -> appointment', `SELECT COUNT(*) n FROM barber_assignment_history h LEFT JOIN appointments a ON a.id=h.appointment_id WHERE a.id IS NULL`],
    ['customers w/ NULL customer_code', `SELECT COUNT(*) n FROM customers WHERE customer_code IS NULL OR customer_code=''`],
    ['QA-leftover barbers', `SELECT COUNT(*) n FROM barbers WHERE name LIKE 'QA%' OR email LIKE 'qa-%'`],
    ['QA-leftover customers', `SELECT COUNT(*) n FROM customers WHERE full_name LIKE 'QA %' OR email LIKE 'qa-%'`],
    ['QA-leftover appointments', `SELECT COUNT(*) n FROM appointments WHERE customer_name LIKE 'QA%'`],
    ['QA-leftover reviews', `SELECT COUNT(*) n FROM reviews WHERE customer_name LIKE 'QA%'`],
    ['QA-leftover contact msgs', `SELECT COUNT(*) n FROM contact_messages WHERE name LIKE 'QA%' OR email LIKE 'qa-%'`],
    ['QA-leftover gallery', `SELECT COUNT(*) n FROM gallery WHERE title LIKE 'QA%'`],
    ['expired unconsumed OTPs', `SELECT COUNT(*) n FROM customer_otps WHERE consumed_at IS NULL AND expires_at < NOW()`],
    ['inactive barbers w/ live availability', `SELECT COUNT(*) n FROM barbers WHERE is_active=0`],
];
async function main() {
    console.log('=== ORPHAN / POLLUTION AUDIT ===');
    for (const [label, sql] of ORPHANS) {
        const [r] = (await database_1.sequelize.query(sql));
        const n = Number(r[0]?.n ?? 0);
        console.log(`${n === 0 ? 'clean' : 'DIRTY'}  ${String(n).padStart(4)}  ${label}`);
    }
    const [list] = (await database_1.sequelize.query(`
    SELECT id, name, email, is_active, portal_enabled FROM barbers
    WHERE name LIKE 'QA%' OR email LIKE 'qa-%' ORDER BY id`));
    if (list.length) {
        console.log('\nQA barbers:', JSON.stringify(list));
    }
    const [serv] = (await database_1.sequelize.query(`
    SELECT s.id, s.name, s.price, s.is_active FROM services s
    LEFT JOIN barber_services bs ON bs.service_id = s.id
    WHERE bs.id IS NULL ORDER BY s.id`));
    console.log('\nservices with no barber assigned:', JSON.stringify(serv));
    await database_1.sequelize.close();
}
main().catch(async (e) => { console.error(e); await database_1.sequelize.close(); process.exit(1); });
//# sourceMappingURL=_qaOrphans.js.map