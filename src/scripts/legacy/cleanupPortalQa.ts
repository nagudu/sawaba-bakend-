import '../models'
import { sequelize } from '../config/database'
import { Appointment, BarberEarning, Customer, Payment } from '../models'
import { Op } from 'sequelize'

async function main(): Promise<void> {
  await sequelize.authenticate()

  const appts = await Appointment.findAll({
    where: {
      [Op.or]: [
        { customerName: { [Op.like]: 'QA %' } },
        { customerEmail: { [Op.like]: 'qa%@test.local' } },
        { customerEmail: { [Op.like]: '%@sawaba.test' } },
        { appointmentDate: '2026-10-10' },
      ],
    },
  })
  console.log('QA appointments:', appts.map(a => a.id).join(',') || 'none')
  for (const a of appts) {
    await Payment.destroy({ where: { appointmentId: a.id } })
    await BarberEarning.destroy({ where: { appointmentId: a.id } })
    await a.destroy()
  }

  const custs = await Customer.findAll({
    where: {
      [Op.or]: [
        { email: { [Op.like]: 'qa%@gmail.com' } },
        { email: { [Op.like]: 'qa%@test.local' } },
        { email: { [Op.like]: '%@sawaba.test' } },
        { fullName: { [Op.like]: 'QA %' } },
      ],
    },
  })
  for (const c of custs) await c.destroy()
  console.log('QA customers removed:', custs.length)

  const left = await Appointment.findAll()
  console.log('appointments remaining:', left.map(a => `${a.id}:${a.customerName}`).join(' ; ') || 'none')

  await sequelize.close()
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
