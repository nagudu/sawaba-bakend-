import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env'
import { sequelize, connectDatabase } from './config/database'
import { apiRouter } from './routes'
import { swaggerSpec } from './swagger'
import { ensureModelColumns } from './scripts/ensureColumns'
import { apiLimiter } from './middleware/rateLimiter'
import { notFoundHandler, errorHandler } from './middleware/errorHandler'
import path from 'node:path'
import fs from 'node:fs'

// Eagerly load all models and associations before starting.
import './models'

const app: Express = express()

// Behind Railway's reverse proxy: correct client IPs for rate limiting
// and silence express-rate-limit's X-Forwarded-For validation error.
app.set('trust proxy', 1)

app.use(helmet())

app.use(
  cors({
    origin: [env.clientUrl, ...env.extraClientOrigins],
    credentials: true,
  }),
)

app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'))

// Paystack webhook: must read the RAW body to validate the x-paystack-signature HMAC.
// Mounted BEFORE express.json so the raw stream is captured first (body-parser marks
// req._body afterwards, so the JSON parser below skips this route automatically).
app.use(
  '/api/payments/paystack/webhook',
  express.raw({ type: '*/*', limit: '1mb' }),
)
app.use((req, _res, next) => {
  if (req.path === '/api/payments/paystack/webhook' && Buffer.isBuffer(req.body)) {
    ;(req as Request & { rawBody?: string }).rawBody = (req.body as Buffer).toString('utf8')
  }
  next()
})

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

app.use('/api', apiLimiter)

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SAWABA API Docs',
}))

app.get('/api/docs/spec', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json')
  res.send(swaggerSpec)
})

app.use('/api', apiRouter)

// Locally uploaded images (offline-first storage driver). Served by the
// backend itself so barber/gallery/service images work with no internet.
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../uploads')
fs.mkdirSync(uploadsDir, { recursive: true })
// Seed copies use stable filenames whose content can be re-pointed, so they
// get a short cache (no immutable). Admin uploads get unique names and are
// served by the same mount — a day of caching is plenty for either case.
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d' }))

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Static frontend serving (production single-service deploy). Mounted BEFORE
// the not-found handler: Express matches middleware in registration order, so
// mounting this inside the async boot task (which runs after notFoundHandler
// was registered) let every SPA route fall through to the API 404. Local dev
// never sets SERVE_STATIC_DIR, so behavior there is unchanged.
const staticDir = process.env.SERVE_STATIC_DIR
if (staticDir) {
  const resolved = path.resolve(staticDir)
  if (fs.existsSync(path.join(resolved, 'index.html'))) {
    app.use(express.static(resolved))
    // SPA fallback: any non-API GET serves index.html so /admin/*, /pay/:token
    // and /account/* survive refresh and direct navigation.
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/') || req.path === '/health') return next()
      res.sendFile(path.join(resolved, 'index.html'))
    })
    console.log(`[server] serving static frontend from ${resolved}`)
  } else {
    console.warn(`[server] SERVE_STATIC_DIR set but no index.html at ${resolved}`)
  }
}

app.use(notFoundHandler)
app.use(errorHandler)

async function startServer(): Promise<void> {
  try {
    await connectDatabase()
    console.log('[server] database connection established')

    // Add-only drift healer: sync({force:false}) never adds columns to
    // existing tables, so a model that outgrows its table would 500 every
    // query. Heal first, then let sync create any missing tables.
    const healed = await ensureModelColumns()
    if (healed.length > 0) {
      console.log(`[server] schema drift healed: ${healed.join(', ')}`)
    }

    await sequelize.sync({ force: false })
    console.log('[server] models synchronized')

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
        // Seeding must never block the API from serving.
        console.error('[server] seed failed (continuing):', seedError)
      }
    }

    const server = app.listen(env.port, () => {
      console.log(`[server] running on http://localhost:${env.port}`)
      console.log(`[server] swagger docs: http://localhost:${env.port}/api/docs`)
    })

    // A second backend is the most common local mistake, and Express only reports
    // it as a bare "EADDRINUSE" stack trace. Say what actually happened and exit
    // cleanly instead of leaving an unhandled 'error' event to crash the process.
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          [
            '',
            `[server] port ${env.port} is already in use — another SAWABA backend is still running.`,
            '        Only one backend can bind the port, and the Vite dev proxy targets exactly this one.',
            '',
            '  Find it:   netstat -ano | findstr :' + env.port,
            '  Stop it:   taskkill /PID <pid> /F',
            '  Or free it: set PORT to something else in backend/.env',
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