import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env'
import { apiRouter } from './routes'
import { swaggerSpec } from './swagger'
import { apiLimiter } from './middleware/rateLimiter'
import { notFoundHandler, errorHandler } from './middleware/errorHandler'
import path from 'node:path'
import fs from 'node:fs'

const app: Express = express()

// Behind reverse proxies (Railway, Vercel): correct client IPs for rate limiting
app.set('trust proxy', 1)

app.use(helmet())

app.use(
  cors({
    origin: [env.clientUrl, ...env.extraClientOrigins],
    credentials: true,
  }),
)

if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'))
}

// Paystack webhook: must read the RAW body to validate the x-paystack-signature HMAC.
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

// Normalization middleware for serverless/Vercel environments:
// If request arrives at /auth/... instead of /api/auth/... due to serverless URL rewriting,
// normalize req.url so routes match /api consistently.
app.use((req, _res, next) => {
  if (
    !req.url.startsWith('/api') &&
    !req.url.startsWith('/uploads') &&
    req.url !== '/health' &&
    !req.url.startsWith('/health')
  ) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`
  }
  next()
})

app.use('/api', apiRouter)

// Locally uploaded images (offline-first storage driver)
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../uploads')
try {
  fs.mkdirSync(uploadsDir, { recursive: true })
} catch {
  // Ignore in read-only filesystems (e.g. Vercel serverless)
}
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d' }))

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Static frontend serving (production single-service deploy)
const staticDir = process.env.SERVE_STATIC_DIR
if (staticDir) {
  const resolved = path.resolve(staticDir)
  if (fs.existsSync(path.join(resolved, 'index.html'))) {
    app.use(express.static(resolved))
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

export { app }
export default app
