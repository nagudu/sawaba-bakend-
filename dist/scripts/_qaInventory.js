"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const rows = async (label, sql) => {
    try {
        const [r] = (await database_1.sequelize.query(sql));
        console.log(label, JSON.stringify(r));
    }
    catch (e) {
        console.log(label, 'ERR', e.message.slice(0, 120));
    }
};
async function main() {
    await rows('ADMINS:', `SELECT id,name,email,role,is_active FROM admins ORDER BY id`);
    await rows('BARBERS:', `SELECT id,name,slug,email,phone,is_active,barber_type,portal_enabled,commission_type,commission_value,location FROM barbers ORDER BY id`);
    await rows('CUSTOMERS:', `SELECT id,full_name,phone,email,customer_code,phone_verified,is_active,google_sub,preferred_barber_id,reminder_opt_in FROM customers ORDER BY id`);
    await rows('APPOINTMENTS:', `SELECT id,customer_name,customer_phone,service_id,barber_id,appointment_date,appointment_time,status,total_amount,reference_code,customer_id FROM appointments ORDER BY id`);
    await rows('PAYMENTS:', `SELECT id,appointment_id,amount,payment_method,status,transaction_reference FROM payments ORDER BY id`);
    await rows('CHECKOUT:', `SELECT id,session_token,customer_phone,status,payment_method,total_amount,converted_appointment_id,created_at FROM checkout_sessions ORDER BY id`);
    await rows('REVIEWS:', `SELECT id,customer_name,rating,status,is_approved,service_name,barber_id,created_at FROM reviews ORDER BY id`);
    await rows('CONTACT:', `SELECT id,name,email,subject,status,is_read,created_at FROM contact_messages ORDER BY id`);
    await rows('GALLERY:', `SELECT id,title,category,barber_id,image FROM gallery ORDER BY id`);
    await rows('EARNINGS:', `SELECT id,appointment_id,barber_id,commission_amount,studio_amount,status FROM barber_earnings ORDER BY id`);
    await rows('NOTIFS:', `SELECT id,barber_id,type,title,read_at FROM barber_notifications ORDER BY id`);
    await rows('AVAILABILITY:', `SELECT * FROM barber_availability ORDER BY barber_id,day_of_week`);
    await rows('ASSIGN_HIST:', `SELECT * FROM barber_assignment_history ORDER BY id`);
    await rows('COMM_HIST:', `SELECT * FROM commission_rate_history ORDER BY id`);
    await rows('BARBER_SERVICES:', `SELECT * FROM barber_services ORDER BY barber_id`);
    await rows('PSETTINGS:', `SELECT id,shop_name,enabled_payment_methods,min_amount,full_payment_required,receipt_required,bank_name,account_number FROM payment_settings`);
    await rows('SERVICES:', `SELECT id,name,slug,price,duration,category,is_active FROM services ORDER BY id`);
    await rows('OTPS:', `SELECT id,phone,purpose,attempts,consumed_at,expires_at FROM customer_otps ORDER BY id`);
    await rows('TOTALS:', `SELECT (SELECT COUNT(*) FROM admins) admins,(SELECT COUNT(*) FROM barbers) barbers,(SELECT COUNT(*) FROM customers) customers,(SELECT COUNT(*) FROM appointments) appts,(SELECT COUNT(*) FROM payments) pays,(SELECT COUNT(*) FROM reviews) revs,(SELECT COUNT(*) FROM contact_messages) msgs,(SELECT COUNT(*) FROM gallery) gal,(SELECT COUNT(*) FROM services) svcs,(SELECT COUNT(*) FROM checkout_sessions) co`);
    await database_1.sequelize.close();
}
main().catch(async (e) => { console.error(e); await database_1.sequelize.close(); process.exit(1); });
//# sourceMappingURL=_qaInventory.js.map