import '../models'
import { sequelize } from '../config/database'
import { Customer, Review } from '../models'
import { Op } from 'sequelize'

async function main(): Promise<void> {
  await sequelize.authenticate()
  const reviews = await Review.findAll({ where: { customerName: 'QA Probe Reviewer' } })
  for (const r of reviews) await r.destroy()
  console.log('QA reviews removed:', reviews.length)

  const custs = await Customer.findAll({ where: { email: { [Op.like]: 'qa%@test.local' } } })
  for (const c of custs) await c.destroy()
  console.log('QA customers removed:', custs.length)

  await sequelize.close()
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
