import '../models'
import { sequelize } from '../config/database'
import { Appointment, Customer, Payment } from '../models'
import { Op } from 'sequelize'

async function main(): Promise<void> {
  await sequelize.authenticate()
  const appts = await Appointment.findAll()
  console.log('appointments:', appts.map(a => `${a.id}:${a.customerName}`).join(' ; ') || 'none')

  const custs = await Customer.findAll({
    where: { [Op.or]: [{ email: { [Op.like]: 'qa%@test.local' } }, { fullName: { [Op.like]: 'QA %' } }] },
  })
  console.log('qa customers remaining:', custs.map(c => `${c.id}:${c.email}`).join(',') || 'none')

  const pays = await Payment.findAll()
  const apptIds = new Set(appts.map(a => a.id))
  const orphans = pays.filter(p => !apptIds.has(p.appointmentId))
  console.log('orphan payments:', orphans.map(p => p.id).join(',') || 'none')

  await sequelize.close()
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
