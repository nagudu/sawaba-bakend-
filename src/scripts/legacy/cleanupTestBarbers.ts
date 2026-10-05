import 'dotenv/config'
import { Op } from 'sequelize'
import { sequelize } from '../config/database'
import { Barber, BarberEarning } from '../models'

/** One-off: remove TEST barbers + their earnings from the battery runs. */
async function run(): Promise<void> {
  await sequelize.authenticate()
  const barbers = await Barber.findAll({ where: { name: { [Op.like]: 'TEST-%' } } })
  const ids = barbers.map((b) => b.id)
  if (ids.length > 0) {
    await BarberEarning.destroy({ where: { barberId: ids } as never })
    for (const b of barbers) await b.destroy()
  }
  console.log(`removed ${ids.length} test barbers: [${ids.join(', ')}]`)
  await sequelize.close()
}

void run().catch((e) => {
  console.error(e)
  process.exit(1)
})
