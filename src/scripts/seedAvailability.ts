import { Barber, BarberAvailability } from '../models'

/**
 * One-off: give every active barber with NO availability rows the salon's
 * default weekly schedule. Rows are real DB records so the admin can then
 * edit each barber's hours from the dashboard.
 */
const DEFAULT_HOURS: Array<{ dayOfWeek: number; startTime: string; endTime: string }> = [
  { dayOfWeek: 0, startTime: '11:00', endTime: '18:00' },
  { dayOfWeek: 1, startTime: '09:00', endTime: '20:00' },
  { dayOfWeek: 2, startTime: '09:00', endTime: '20:00' },
  { dayOfWeek: 3, startTime: '09:00', endTime: '20:00' },
  { dayOfWeek: 4, startTime: '09:00', endTime: '20:00' },
  { dayOfWeek: 5, startTime: '09:00', endTime: '21:00' },
  { dayOfWeek: 6, startTime: '08:00', endTime: '21:00' },
]

async function run(): Promise<void> {
  const barbers = await Barber.findAll({ where: { isActive: true } })
  let created = 0
  for (const barber of barbers) {
    const existing = await BarberAvailability.findAll({ where: { barberId: barber.id } })
    if (existing.length > 0) {
      console.log(`barber ${barber.id} ${barber.name}: ${existing.length} rows exist — skipping`)
      continue
    }
    for (const row of DEFAULT_HOURS) {
      await BarberAvailability.create({ barberId: barber.id, ...row, isAvailable: true })
      created += 1
    }
    console.log(`barber ${barber.id} ${barber.name}: seeded 7 days`)
  }
  console.log(`done — ${created} rows created`)
  process.exit(0)
}

void run().catch((err) => {
  console.error(err)
  process.exit(1)
})
