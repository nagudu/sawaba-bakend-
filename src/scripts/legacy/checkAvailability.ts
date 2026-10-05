import { Barber, BarberAvailability } from '../models'

async function run(): Promise<void> {
  const barbers = await Barber.findAll()
  console.log('=== Barbers ===')
  for (const b of barbers) {
    console.log(`id=${b.id} ${b.name} active=${b.isActive}`)
  }
  const rows = await BarberAvailability.findAll()
  console.log('\n=== barber_availability rows ===')
  for (const r of rows) {
    console.log(
      `barberId=${r.barberId} dayOfWeek=${r.dayOfWeek} ${String(r.startTime)}-${String(r.endTime)} available=${r.isAvailable}`,
    )
  }
  process.exit(0)
}

void run().catch((err) => {
  console.error(err)
  process.exit(1)
})
