"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const models_1 = require("../models");
const dateKey = (date) => date.replace(/-/g, '');
const used = new Set();
async function backfill() {
    const appointments = await models_1.Appointment.findAll({
        order: [
            ['appointmentDate', 'ASC'],
            ['id', 'ASC'],
        ],
    });
    // Seed used set with existing non-null codes first
    for (const appointment of appointments) {
        if (appointment.referenceCode)
            used.add(appointment.referenceCode);
    }
    for (const appointment of appointments) {
        if (appointment.referenceCode)
            continue;
        let seq = 1;
        let candidate = `APT-${dateKey(appointment.appointmentDate)}-${String(seq).padStart(3, '0')}`;
        // Ensure per-date numbering continues from the max existing for that date
        const sameDate = appointments.filter((a) => a.appointmentDate === appointment.appointmentDate && a.referenceCode);
        const numbers = sameDate
            .map((a) => /APT-\d+$/.exec(a.referenceCode)?.[0])
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0);
        const start = (numbers.length ? Math.max(...numbers) : 0) + 1;
        for (let n = start; n < start + 1000; n += 1) {
            candidate = `APT-${dateKey(appointment.appointmentDate)}-${String(n).padStart(3, '0')}`;
            if (!used.has(candidate))
                break;
        }
        used.add(candidate);
        appointment.referenceCode = candidate;
        await appointment.save();
        console.log(`  #${appointment.id} -> ${candidate}`);
    }
    console.log('backfill complete:', appointments.length, 'appointments processed');
    process.exit(0);
}
backfill().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=backfillReferenceCodes.js.map