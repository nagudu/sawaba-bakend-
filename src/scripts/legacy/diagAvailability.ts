import { sequelize } from '../config/database'
import { QueryTypes } from 'sequelize'

async function run(): Promise<void> {
  await sequelize.authenticate()
  try {
    const rows = await sequelize.query(
      'SELECT ba.id, ba.barber_id FROM barber_availabilities ba LEFT JOIN barbers b ON b.id = ba.barber_id WHERE b.id IS NULL',
      { type: QueryTypes.SELECT },
    )
    console.log('orphan availability rows:', JSON.stringify(rows))
  } catch (error) {
    console.log('orphan query failed:', (error as Error).message)
  }
  try {
    const created = await sequelize.query(
      'SELECT COUNT(*) AS n FROM checkout_sessions',
      { type: QueryTypes.SELECT },
    )
    console.log('checkout_sessions count:', JSON.stringify(created))
  } catch (error) {
    console.log('checkout_sessions probe failed:', (error as Error).message)
  }
  await sequelize.close()
}

void run()
