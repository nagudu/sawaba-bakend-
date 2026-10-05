import 'dotenv/config'
import { sequelize } from '../config/database'

/** Verifies the internal/external barber schema migration landed. */
async function run(): Promise<void> {
  await sequelize.authenticate()
  const qi = sequelize.getQueryInterface()
  const barberCols = await qi.describeTable('barbers')
  console.log('ALL BARBER COLS:', Object.keys(barberCols).join(','))
  const apptCols = await qi.describeTable('appointments')
  console.log('ALL APPT COLS:', Object.keys(apptCols).join(','))
  console.log('barber_earnings:', await qi.describeTable('barber_earnings').then(() => 'OK').catch(() => 'MISSING'))
  console.log('barber_assignment_history:', await qi.describeTable('barber_assignment_history').then(() => 'OK').catch(() => 'MISSING'))
  await sequelize.close()
}

void run().catch((e) => {
  console.error(e)
  process.exit(1)
})
