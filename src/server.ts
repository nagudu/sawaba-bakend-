import { app } from './app'
import { env } from './config/env'
import { connectDatabase } from './config/database'

async function startServer(): Promise<void> {
  try {
    await connectDatabase()
    console.log('[server] database connection established')

    // First-boot demo seeding (deployment bootstrap): idempotent, only runs
    // when SEED_ON_BOOT=true. Keeps the live DB private — no external seeding.
    if (process.env.SEED_ON_BOOT === 'true') {
      try {
        const { seedDatabase } = await import('./scripts/seed')
        const result = await seedDatabase()
        console.log(
          `[server] seed complete — services: ${result.services}, barbers: ${result.barbers}, gallery: ${result.gallery}, reviews: ${result.reviews}`,
        )
      } catch (seedError) {
        console.error('[server] seed failed (continuing):', seedError)
      }
    }

    const server = app.listen(env.port, () => {
      console.log(`[server] running on http://localhost:${env.port}`)
      console.log(`[server] swagger docs: http://localhost:${env.port}/api/docs`)
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          [
            '',
            `[server] port ${env.port} is already in use (on macOS, AirPlay often uses 5000; or another backend is running).`,
            '        Only one backend can bind the port, and the Vite dev proxy targets exactly this one.',
            '',
            '  Mac/Linux: lsof -ti:' + env.port + ' | xargs kill -9',
            '  Windows:   netstat -ano | findstr :' + env.port + ' && taskkill /PID <pid> /F',
            '  Or free it: set PORT to something else in backend/.env (e.g. PORT=5001)',
            '',
          ].join('\n'),
        )
        process.exit(1)
      }
      throw err
    })
  } catch (error) {
    console.error('[server] failed to start:', error)
    process.exit(1)
  }
}

void startServer()