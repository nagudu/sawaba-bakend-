import '../models'
import { sequelize } from '../config/database'
import { Customer, Review } from '../models'
import { Op } from 'sequelize'

async function main(): Promise<void> {
  await sequelize.authenticate()
  const revs = await Review.findAll({})
  console.log('all reviewers:', revs.map(r => `${r.id}:${r.customerName}:${(r as unknown as { status?: string }).status ?? r.getDataValue('status')}`).join(' ; ') || 'none')
  const custs = await Customer.findAll({ where: { email: { [Op.like]: 'qa%' } } })
  console.log('qa customers:', custs.map(c => c.email).join(',') || 'none')
  await sequelize.close()
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
