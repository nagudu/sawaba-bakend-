import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { env } from './config/env'
import { apiRouter } from './routes'
import { swaggerSpec, getSwaggerHtml } from './swagger'
import { apiLimiter } from './middleware/rateLimiter'
import { notFoundHandler, errorHandler } from './middleware/errorHandler'
import path from 'node:path'
import fs from 'node:fs'

const app: Express = express()

// Behind reverse proxies (Railway, Vercel): correct client IPs for rate limiting
app.set('trust proxy', 1)

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
          'https://unpkg.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
          'https://fonts.googleapis.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
)

const allowedOrigins = new Set([
  'https://sawabagroomingstudio.com.ng',
  'https://www.sawabagroomingstudio.com.ng',
  'http://sawabagroomingstudio.com.ng',
  'http://www.sawabagroomingstudio.com.ng',
  'https://sawaba.vercel.app',
  env.clientUrl,
  ...env.extraClientOrigins,
])

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true)

      if (
        allowedOrigins.has(origin) ||
        origin.endsWith('sawabagroomingstudio.com.ng') ||
        origin.endsWith('.vercel.app') ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return callback(null, true)
      }

      // Fallback: allow request in production
      return callback(null, true)
    },
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

function renderWelcome(req: Request, res: Response): void {
  if (req.accepts('html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SAWABA Grooming Studio API</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at 50% 25%, #181822 0%, #09090b 100%);
      color: #f4f4f6;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      max-width: 520px;
      width: 100%;
      background: rgba(18, 18, 24, 0.85);
      border: 1px solid rgba(212, 175, 55, 0.3);
      border-radius: 24px;
      padding: 42px 36px;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6), 0 0 35px rgba(212, 175, 55, 0.08);
      backdrop-filter: blur(12px);
    }
    .icon {
      width: 60px;
      height: 60px;
      margin: 0 auto 20px;
      border-radius: 16px;
      border: 1px solid rgba(212, 175, 55, 0.45);
      background: rgba(212, 175, 55, 0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      color: #d4af37;
    }
    h1 {
      font-family: 'Playfair Display', serif;
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 10px;
      color: #ffffff;
      letter-spacing: 0.02em;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #d4af37;
      margin-bottom: 16px;
    }
    p {
      color: #a1a1aa;
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 30px;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 22px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-gold {
      background: linear-gradient(135deg, #d4af37 0%, #aa8528 100%);
      color: #09090c;
    }
    .btn-gold:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }
    .btn-outline {
      border: 1px solid #27272a;
      background: #141418;
      color: #e4e4e7;
    }
    .btn-outline:hover {
      border-color: #d4af37;
      color: #d4af37;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✂</div>
    <div class="badge">SAWABA GROOMING STUDIO</div>
    <h1>Welcome to SAWABA API</h1>
    <p>The official RESTful API and serverless engine powering appointments, barber assignments, catalog, reviews, and client payments.</p>
    <div class="links">
      <a href="/api/docs" class="btn btn-gold">Interactive API Docs</a>
      <a href="/health" class="btn btn-outline">Health Check</a>
      <a href="/api/docs/spec" class="btn btn-outline">OpenAPI JSON</a>
    </div>
  </div>
</body>
</html>`)
  }

  res.json({
    success: true,
    message: 'Welcome to SAWABA Grooming Studio API',
    status: 'online',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/health',
  })
}

// Welcome endpoints
app.get('/', renderWelcome)
app.get('/api', renderWelcome)
app.get('/api/', renderWelcome)

// Swagger documentation endpoints (uses CDN assets — 100% reliable on Vercel Serverless)
app.get(['/api/docs', '/api/docs/'], (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(getSwaggerHtml('/api/docs/spec'))
})
app.get('/api/docs/swagger-ui.css', (_req: Request, res: Response) => {
  res.redirect('https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui.min.css')
})
app.get('/api/docs/swagger-ui-bundle.js', (_req: Request, res: Response) => {
  res.redirect('https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-bundle.min.js')
})
app.get('/api/docs/swagger-ui-standalone-preset.js', (_req: Request, res: Response) => {
  res.redirect('https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-standalone-preset.min.js')
})
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
    !req.url.startsWith('/health') &&
    req.url !== '/'
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
