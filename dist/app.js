"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const routes_1 = require("./routes");
const swagger_1 = require("./swagger");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const app = (0, express_1.default)();
exports.app = app;
// Behind reverse proxies (Railway, Vercel): correct client IPs for rate limiting
app.set('trust proxy', 1);
app.use((0, helmet_1.default)({
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
}));
const allowedOrigins = new Set([
    'https://sawabagroomingstudio.com.ng',
    'https://www.sawabagroomingstudio.com.ng',
    'http://sawabagroomingstudio.com.ng',
    'http://www.sawabagroomingstudio.com.ng',
    'https://sawaba.vercel.app',
    env_1.env.clientUrl,
    ...env_1.env.extraClientOrigins,
]);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.has(origin) ||
            origin.endsWith('sawabagroomingstudio.com.ng') ||
            origin.endsWith('.vercel.app') ||
            origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:')) {
            return callback(null, true);
        }
        // Fallback: allow request in production
        return callback(null, true);
    },
    credentials: true,
}));
if (env_1.env.nodeEnv !== 'test') {
    app.use((0, morgan_1.default)(env_1.env.nodeEnv === 'production' ? 'combined' : 'dev'));
}
// Paystack webhook: must read the RAW body to validate the x-paystack-signature HMAC.
app.use('/api/payments/paystack/webhook', express_1.default.raw({ type: '*/*', limit: '1mb' }));
app.use((req, _res, next) => {
    if (req.path === '/api/payments/paystack/webhook' && Buffer.isBuffer(req.body)) {
        ;
        req.rawBody = req.body.toString('utf8');
    }
    next();
});
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api', rateLimiter_1.apiLimiter);
function renderWelcome(req, res) {
    if (req.accepts('html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
</html>`);
    }
    res.json({
        success: true,
        message: 'Welcome to SAWABA Grooming Studio API',
        status: 'online',
        version: '1.0.0',
        documentation: '/api/docs',
        health: '/health',
    });
}
// Welcome endpoints
app.get('/', renderWelcome);
app.get('/api', renderWelcome);
app.get('/api/', renderWelcome);
// Swagger documentation endpoints (uses CDN assets — 100% reliable on Vercel Serverless)
app.get(['/api/docs', '/api/docs/'], (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send((0, swagger_1.getSwaggerHtml)('/api/docs/spec'));
});
app.get('/api/docs/swagger-ui.css', (_req, res) => {
    res.redirect('https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui.min.css');
});
app.get('/api/docs/swagger-ui-bundle.js', (_req, res) => {
    res.redirect('https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-bundle.min.js');
});
app.get('/api/docs/swagger-ui-standalone-preset.js', (_req, res) => {
    res.redirect('https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-standalone-preset.min.js');
});
app.get('/api/docs/spec', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swagger_1.swaggerSpec);
});
// Normalization middleware for serverless/Vercel environments:
// If request arrives at /auth/... instead of /api/auth/... due to serverless URL rewriting,
// normalize req.url so routes match /api consistently.
app.use((req, _res, next) => {
    if (!req.url.startsWith('/api') &&
        !req.url.startsWith('/uploads') &&
        req.url !== '/health' &&
        !req.url.startsWith('/health') &&
        req.url !== '/') {
        req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
    }
    next();
});
app.use('/api', routes_1.apiRouter);
// Locally uploaded images (offline-first storage driver)
const uploadsDir = process.env.UPLOADS_DIR
    ? node_path_1.default.resolve(process.env.UPLOADS_DIR)
    : node_path_1.default.resolve(__dirname, '../uploads');
try {
    node_fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
catch {
    // Ignore in read-only filesystems (e.g. Vercel serverless)
}
app.use('/uploads', express_1.default.static(uploadsDir, { maxAge: '1d' }));
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Static frontend serving (production single-service deploy)
const staticDir = process.env.SERVE_STATIC_DIR;
if (staticDir) {
    const resolved = node_path_1.default.resolve(staticDir);
    if (node_fs_1.default.existsSync(node_path_1.default.join(resolved, 'index.html'))) {
        app.use(express_1.default.static(resolved));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api/') || req.path === '/health')
                return next();
            res.sendFile(node_path_1.default.join(resolved, 'index.html'));
        });
        console.log(`[server] serving static frontend from ${resolved}`);
    }
    else {
        console.warn(`[server] SERVE_STATIC_DIR set but no index.html at ${resolved}`);
    }
}
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map