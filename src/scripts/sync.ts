import bcrypt from 'bcryptjs'
import { sequelize } from '../config/database'
import { env } from '../config/env'
import { Admin } from '../models'

async function run(): Promise<void> {
  try {
    await sequelize.authenticate()
    console.log('[db:sync] database connection established')

    await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' })
    console.log('[db:sync] models synchronized')

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