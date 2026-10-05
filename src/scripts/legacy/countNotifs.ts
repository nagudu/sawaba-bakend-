import '../models'
import { sequelize } from '../config/database'
import { BarberNotification } from '../models'

async function main(): Promise<void> {
  await sequelize.authenticate()
  const total = await BarberNotification.count()
  const unread = await BarberNotification.count({ where: { readAt: null } as never })
  console.log(JSON.stringify({ total, unread }))
  await sequelize.close()
}
main()
