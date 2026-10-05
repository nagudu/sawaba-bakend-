import { sequelize } from '../config/database'
import { QueryTypes } from 'sequelize'

async function run(): Promise<void> {
  await sequelize.authenticate()
  const count = async (sql: string): Promise<number> => {
    const rows = (await sequelize.query(sql, { type: QueryTypes.SELECT })) as Array<{ n: number }>
    return Number(rows[0]?.n ?? 0)
  }
  const result = {
    appointments: await count('SELECT COUNT(*) AS n FROM appointments'),
    payments: await count('SELECT COUNT(*) AS n FROM payments'),
    checkoutSessions: await count('SELECT COUNT(*) AS n FROM checkout_sessions'),
    openSessions: await count(
      "SELECT COUNT(*) AS n FROM checkout_sessions WHERE status IN ('OPEN','AWAITING_PAYMENT')",
    ),
  }
  console.log(JSON.stringify(result))
  await sequelize.close()
}

void run()
