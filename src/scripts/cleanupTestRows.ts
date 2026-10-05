import 'dotenv/config'
import { Op } from 'sequelize'
import { sequelize } from '../config/database'
import { Appointment, CheckoutSession, Payment } from '../models'

/**
 * One-off cleanup: removes the synthetic rows created by the availability
 * test battery and preview booking-flow tests ("Test …" / "Preview Flow Test").
 */
async function run(): Promise<void> {
  await sequelize.authenticate()
  const like = (column: string) =>
    sequelize.where(sequelize.col(column), { [Op.like]: '%Test%' })
  const appointments = await Appointment.findAll({ where: like('customer_name') })
  const ids = appointments.map((a) => a.id)
  if (ids.length > 0) {
    await Payment.destroy({ where: { appointmentId: ids } as never })
    await Appointment.destroy({ where: { id: ids } as never })
  }
  const sessions = await CheckoutSession.destroy({ where: like('customer_name') })
  console.log(`cleaned: ${ids.length} appointments, ${sessions} sessions`)
  await sequelize.close()
}

void run().catch((error) => {
  console.error('cleanup failed:', error)
  process.exit(1)
})
