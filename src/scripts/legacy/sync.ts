import bcrypt from 'bcryptjs'
import { sequelize } from '../config/database'
import { env } from '../config/env'
import { Admin } from '../models'

async function run(): Promise<void> {
  try {
    await sequelize.authenticate()
    console.log('[db:sync] database connection established')

    // NEVER sync({ alter: true }) here. `alter` drops and rebuilds foreign keys
    // and can recreate columns, which silently loses rows — it left a
    // barber_earnings row pointing at a deleted appointment despite that FK
    // being ON DELETE CASCADE. Schema changes go through Prisma migrations
    // (`npx prisma migrate dev`) instead. This script only creates missing
    // tables, matching what the server does on boot.
    await sequelize.sync({ force: false })
    console.log('[db:sync] models synchronized (create-only; use prisma migrate for schema changes)')

    const [admin, created] = await Admin.findOrCreate({
      where: { email: env.adminSeed.email.toLowerCase() },
      defaults: {
        name: env.adminSeed.name,
        email: env.adminSeed.email.toLowerCase(),
        password: await bcrypt.hash(env.adminSeed.password, 12),
        role: 'ADMIN',
      },
    })


    console.log(
      created
        ? `[db:sync] seed admin created: ${admin.email}`
        : `[db:sync] admin already exists: ${admin.email}`,
    )

    await sequelize.close()
    console.log('[db:sync] done')
  } catch (error) {
    console.error('[db:sync] failed:', error)
    process.exitCode = 1
  }
}

void run()