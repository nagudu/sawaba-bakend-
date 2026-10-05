"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../models");
const database_1 = require("../config/database");
const models_1 = require("../models");
const sequelize_1 = require("sequelize");
const like = (p) => ({ [sequelize_1.Op.like]: `%${p}%` });
// Any row created by a QA harness: test e-mail domains, QA/Journey/Probe/Sec names, generated phones,
// plus the TEST-*/LOC-TEST/Checkout Tester rows left by earlier sessions.
const QA_EMAIL = [like('@test.local'), like('qa-cust-'), like('probe'), like('journey-'), like('resp-'), like('secprobe'), like('cascade'), like('smoke'), like('test-'), like('checkout-tester')];
const QA_NAME = [like('QA %'), like('Journey %'), like('Journey Customer'), like('Probe %'), like('SecProbe'), like('Cascade'), like('Resp %'), like('TEST-%'), like('LOC-TEST %'), like('Checkout Tester')];
const GENUINE_BARBER = 'Gaddafi Salisu';
const GENUINE_CUSTOMER = 'Halifa Shuaibu';
let removed = 0;
const tally = {};
const bump = (k, n = 1) => { tally[k] = (tally[k] ?? 0) + n; removed += n; };
async function main() {
    await database_1.sequelize.authenticate();
    const dryRun = process.argv.includes('--dry-run');
    // ---------- report what we are about to touch ----------
    const qaBarbers = await models_1.Barber.findAll({ where: { [sequelize_1.Op.or]: [{ email: { [sequelize_1.Op.or]: QA_EMAIL } }, { name: { [sequelize_1.Op.or]: QA_NAME } }] }, attributes: ['id', 'name', 'email', 'isActive'] });
    const qaCustomers = await models_1.Customer.findAll({ where: { [sequelize_1.Op.or]: [{ email: { [sequelize_1.Op.or]: QA_EMAIL } }, { fullName: { [sequelize_1.Op.or]: QA_NAME } }] }, attributes: ['id', 'fullName', 'email', 'phone'] });
    console.log(`\nQA barbers: ${qaBarbers.length}`);
    qaBarbers.forEach((b) => console.log(`   #${b.id} ${b.name} <${b.email ?? 'no-email'}> active=${b.isActive}`));
    console.log(`QA customers: ${qaCustomers.length}`);
    qaCustomers.forEach((c) => console.log(`   #${c.id} ${c.fullName} <${c.email ?? 'no-email'}> ${c.phone}`));
    const qaBIds = qaBarbers.map((b) => b.id);
    const qaCIds = qaCustomers.map((c) => c.id);
    // appointments owned by, or named after, a QA customer/barber
    const qaAppts = await models_1.Appointment.findAll({
        where: { [sequelize_1.Op.or]: [
                ...(qaCIds.length ? [{ customerId: { [sequelize_1.Op.in]: qaCIds } }] : []),
                ...(qaBIds.length ? [{ barberId: { [sequelize_1.Op.in]: qaBIds } }] : []),
                { customerName: { [sequelize_1.Op.or]: QA_NAME } },
                { customerPhone: { [sequelize_1.Op.like]: '080%' }, customerEmail: { [sequelize_1.Op.or]: QA_EMAIL } },
            ] },
        attributes: ['id', 'referenceCode', 'customerName', 'status'],
    });
    const qaApptIds = qaAppts.map((a) => a.id);
    console.log(`QA appointments: ${qaAppts.length}`);
    const counts = {
        payments: qaApptIds.length ? await models_1.Payment.count({ where: { appointmentId: { [sequelize_1.Op.in]: qaApptIds } } }) : 0,
        earnings: qaApptIds.length ? await models_1.BarberEarning.count({ where: { appointmentId: { [sequelize_1.Op.in]: qaApptIds } } }) : 0,
        assignHistory: qaApptIds.length ? await models_1.BarberAssignmentHistory.count({ where: { appointmentId: { [sequelize_1.Op.in]: qaApptIds } } }) : 0,
        sessions: qaApptIds.length ? await models_1.CheckoutSession.count({ where: { convertedAppointmentId: { [sequelize_1.Op.in]: qaApptIds } } }) : 0,
        orphanSessions: await models_1.CheckoutSession.count({ where: { status: { [sequelize_1.Op.in]: ['OPEN', 'AWAITING_PAYMENT', 'EXPIRED'] } } }),
        otp: await models_1.CustomerOtp.count({ where: { [sequelize_1.Op.or]: [{ phone: { [sequelize_1.Op.like]: '080%' } }, { expiresAt: { [sequelize_1.Op.lt]: new Date() } }] } }),
        notifs: qaBIds.length ? await models_1.BarberNotification.count({ where: { barberId: { [sequelize_1.Op.in]: qaBIds } } }) : 0,
        reviews: await models_1.Review.count({ where: { [sequelize_1.Op.or]: [{ customerName: { [sequelize_1.Op.or]: QA_NAME }, customerEmail: { [sequelize_1.Op.or]: QA_EMAIL } }] } }),
        contacts: await models_1.ContactMessage.count({ where: { [sequelize_1.Op.or]: [{ name: { [sequelize_1.Op.or]: QA_NAME } }, { email: { [sequelize_1.Op.or]: QA_EMAIL } }] } }),
        replies: await models_1.ContactReply.count({ where: { [sequelize_1.Op.or]: [{ subject: { [sequelize_1.Op.like]: 'QA%' } }, { message: { [sequelize_1.Op.like]: 'QA%' } }] } }),
        gallery: await models_1.Gallery.count({ where: { [sequelize_1.Op.or]: [{ title: { [sequelize_1.Op.or]: QA_NAME } }, { image: { [sequelize_1.Op.like]: '%qa-%' } }] } }),
    };
    console.log('dependent rows:', JSON.stringify(counts));
    // ---------- prove the genuine business data is not in the delete set ----------
    const keptBarbers = await models_1.Barber.findAll({ where: { id: { [sequelize_1.Op.notIn]: qaBIds.length ? qaBIds : [0] } }, attributes: ['id', 'name', 'email'] });
    const keptCustomers = await models_1.Customer.findAll({ where: { id: { [sequelize_1.Op.notIn]: qaCIds.length ? qaCIds : [0] } }, attributes: ['id', 'fullName', 'email'] });
    const keptAppts = await models_1.Appointment.findAll({ where: { id: { [sequelize_1.Op.notIn]: qaApptIds.length ? qaApptIds : [0] } }, attributes: ['id', 'referenceCode', 'customerName', 'status'] });
    console.log(`\nPRESERVED barbers:   ${keptBarbers.map((b) => `#${b.id} ${b.name}`).join(' | ') || 'none'}`);
    console.log(`PRESERVED customers: ${keptCustomers.map((c) => `#${c.id} ${c.fullName}`).join(' | ') || 'none'}`);
    console.log(`PRESERVED appointments: ${keptAppts.map((a) => `#${a.id} ${a.referenceCode} (${a.customerName})`).join(' | ') || 'none'}`);
    if (process.argv.includes('--confirm')) {
        const realCustomer = keptCustomers.find((c) => c.fullName === GENUINE_CUSTOMER);
        const realBarber = keptBarbers.find((b) => b.name === GENUINE_BARBER);
        const realAppt = keptAppts.find((a) => a.customerName === GENUINE_CUSTOMER);
        if (!realCustomer || !realBarber || !realAppt) {
            console.log(`\n!! genuine data missing from the preserved set - ABORT (barber=${Boolean(realBarber)} customer=${Boolean(realCustomer)} appointment=${Boolean(realAppt)})`);
            await database_1.sequelize.close();
            process.exit(2);
        }
        console.log(`\ngenuine records preserved: barber #${realBarber.id}, customer #${realCustomer.id}, appointment #${realAppt.id} (${realAppt.referenceCode})`);
    }
    if (dryRun) {
        console.log('\n(dry run - nothing deleted)');
        await database_1.sequelize.close();
        return;
    }
    // ---------- delete leaves first ----------
    if (qaApptIds.length) {
        bump('payments', await models_1.Payment.destroy({ where: { appointmentId: { [sequelize_1.Op.in]: qaApptIds } } }));
        bump('barberEarnings', await models_1.BarberEarning.destroy({ where: { appointmentId: { [sequelize_1.Op.in]: qaApptIds } } }));
        bump('assignmentHistory', await models_1.BarberAssignmentHistory.destroy({ where: { appointmentId: { [sequelize_1.Op.in]: qaApptIds } } }));
        bump('checkoutSessions', await models_1.CheckoutSession.destroy({ where: { convertedAppointmentId: { [sequelize_1.Op.in]: qaApptIds } } }));
        bump('appointments', await models_1.Appointment.destroy({ where: { id: { [sequelize_1.Op.in]: qaApptIds } } }));
    }
    bump('abandonedSessions', await models_1.CheckoutSession.destroy({ where: { status: { [sequelize_1.Op.in]: ['OPEN', 'AWAITING_PAYMENT', 'EXPIRED'] } } }));
    bump('customerOtp', await models_1.CustomerOtp.destroy({ where: { [sequelize_1.Op.or]: [{ phone: { [sequelize_1.Op.like]: '080%' } }, { expiresAt: { [sequelize_1.Op.lt]: new Date() } }] } }));
    if (qaBIds.length) {
        bump('barberNotifications', await models_1.BarberNotification.destroy({ where: { barberId: { [sequelize_1.Op.in]: qaBIds } } }));
        bump('barberServices', await models_1.BarberService.destroy({ where: { barberId: { [sequelize_1.Op.in]: qaBIds } } }));
        bump('barberAvailability', await models_1.BarberAvailability.destroy({ where: { barberId: { [sequelize_1.Op.in]: qaBIds } } }));
        bump('barberAssignmentHistory', await models_1.BarberAssignmentHistory.destroy({ where: { [sequelize_1.Op.or]: [{ previousBarberId: { [sequelize_1.Op.in]: qaBIds } }, { newBarberId: { [sequelize_1.Op.in]: qaBIds } }] } }));
        bump('barberEarningsByBarber', await models_1.BarberEarning.destroy({ where: { barberId: { [sequelize_1.Op.in]: qaBIds } } }));
    }
    bump('reviews', await models_1.Review.destroy({ where: { [sequelize_1.Op.or]: [{ customerName: { [sequelize_1.Op.or]: QA_NAME }, customerEmail: { [sequelize_1.Op.or]: QA_EMAIL } }] } }));
    bump('contactReplies', await models_1.ContactReply.destroy({ where: { [sequelize_1.Op.or]: [{ subject: { [sequelize_1.Op.like]: 'QA%' }, message: { [sequelize_1.Op.like]: 'QA%' } }] } }));
    bump('contactMessages', await models_1.ContactMessage.destroy({ where: { [sequelize_1.Op.or]: [{ name: { [sequelize_1.Op.or]: QA_NAME } }, { email: { [sequelize_1.Op.or]: QA_EMAIL } }] } }));
    bump('gallery', await models_1.Gallery.destroy({ where: { [sequelize_1.Op.or]: [{ title: { [sequelize_1.Op.or]: QA_NAME } }, { image: { [sequelize_1.Op.like]: '%qa-%' } }] } }));
    bump('customers', await models_1.Customer.destroy({ where: { id: { [sequelize_1.Op.in]: qaCIds } } }));
    bump('barbers', await models_1.Barber.destroy({ where: { id: { [sequelize_1.Op.in]: qaBIds } } }));
    // ---------- legacy orphans left by pre-fix barber deletes ----------
    const orphanServices = await models_1.BarberService.findAll({ attributes: ['barberId'] });
    const liveBarberIds = new Set((await models_1.Barber.findAll({ attributes: ['id'] })).map((b) => b.id));
    const deadServiceBarberIds = [...new Set(orphanServices.map((s) => s.barberId))].filter((id) => !liveBarberIds.has(id));
    const orphanAvail = await models_1.BarberAvailability.findAll({ attributes: ['barberId'] });
    const deadAvailBarberIds = [...new Set(orphanAvail.map((a) => a.barberId))].filter((id) => !liveBarberIds.has(id));
    if (deadServiceBarberIds.length)
        bump('orphanBarberServices', await models_1.BarberService.destroy({ where: { barberId: { [sequelize_1.Op.in]: deadServiceBarberIds } } }));
    if (deadAvailBarberIds.length)
        bump('orphanBarberAvailability', await models_1.BarberAvailability.destroy({ where: { barberId: { [sequelize_1.Op.in]: deadAvailBarberIds } } }));
    // appointments/payments whose barber no longer exists
    const liveApptBarberIds = [...new Set((await models_1.Appointment.findAll({ attributes: ['barberId'] })).map((a) => a.barberId))];
    const deadApptBarberIds = liveApptBarberIds.filter((id) => !liveBarberIds.has(id));
    if (deadApptBarberIds.length)
        console.log(`\n! ${deadApptBarberIds.length} barber id(s) still referenced by appointments: ${deadApptBarberIds.join(',')} (left in place - needs a decision)`);
    // notifications that point at appointments which no longer exist
    const liveApptIds = new Set((await models_1.Appointment.findAll({ attributes: ['id'] })).map((a) => a.id));
    const notifRows = await models_1.BarberNotification.findAll();
    const danglingNotif = notifRows.filter((n) => {
        const m = /appointment #(\d+)/.exec(n.message ?? '');
        return m !== null && !liveApptIds.has(Number(m[1]));
    });
    for (const n of danglingNotif)
        await n.destroy();
    bump('danglingBarberNotifications', danglingNotif.length);
    console.log('\n=== removed ===');
    for (const [k, v] of Object.entries(tally).sort())
        if (v)
            console.log(`   ${k}: ${v}`);
    console.log(`   TOTAL: ${removed}`);
    // ---------- final state ----------
    console.log('\n=== remaining (real data) ===');
    const remaining = [models_1.Admin, models_1.Barber, models_1.Customer, models_1.Service, models_1.Appointment, models_1.Payment, models_1.Review, models_1.Gallery, models_1.ContactMessage, models_1.ContactReply, models_1.BarberService, models_1.BarberAvailability, models_1.BarberEarning, models_1.BarberNotification, models_1.CheckoutSession, models_1.CustomerOtp];
    for (const m of remaining) {
        console.log(`   ${m.name}: ${await m.count()}`);
    }
    await database_1.sequelize.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
//# sourceMappingURL=cleanupQaFixtures.js.map