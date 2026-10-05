"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const routes_1 = require("./routes");
const swagger_1 = require("./swagger");
const ensureColumns_1 = require("./scripts/ensureColumns");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
// Eagerly load all models and associations before starting.
require("./models");
const app = (0, express_1.default)();
// Behind Railway's reverse proxy: correct client IPs for rate limiting
// and silence express-rate-limit's X-Forwarded-For validation error.
app.set('trust proxy', 1);
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: [env_1.env.clientUrl, ...env_1.env.extraClientOrigins],
    credentials: true,
}));
app.use((0, morgan_1.default)(env_1.env.nodeEnv === 'production' ? 'combined' : 'dev'));
// Paystack webhook: must read the RAW body to validate the x-paystack-signature HMAC.
// Mounted BEFORE express.json so the raw stream is captured first (body-parser marks
// req._body afterwards, so the JSON parser below skips this route automatically).
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
app.use('/api/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'SAWABA API Docs',
}));
app.get('/api/docs/spec', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swagger_1.swaggerSpec);
});
app.use('/api', routes_1.apiRouter);
// Locally uploaded images (offline-first storage driver). Served by the
// backend itself so barber/gallery/service images work with no internet.
const uploadsDir = process.env.UPLOADS_DIR
    ? node_path_1.default.resolve(process.env.UPLOADS_DIR)
    : node_path_1.default.resolve(__dirname, '../uploads');
node_fs_1.default.mkdirSync(uploadsDir, { recursive: true });
// Seed copies use stable filenames whose content can be re-pointed, so they
// get a short cache (no immutable). Admin uploads get unique names and are
// served by the same mount — a day of caching is plenty for either case.
app.use('/uploads', express_1.default.static(uploadsDir, { maxAge: '1d' }));
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Static frontend serving (production single-service deploy). Mounted BEFORE
// the not-found handler: Express matches middleware in registration order, so
// mounting this inside the async boot task (which runs after notFoundHandler
// was registered) let every SPA route fall through to the API 404. Local dev
// never sets SERVE_STATIC_DIR, so behavior there is unchanged.
const staticDir = process.env.SERVE_STATIC_DIR;
if (staticDir) {
    const resolved = node_path_1.default.resolve(staticDir);
    if (node_fs_1.default.existsSync(node_path_1.default.join(resolved, 'index.html'))) {
        app.use(express_1.default.static(resolved));
        // SPA fallback: any non-API GET serves index.html so /admin/*, /pay/:token
        // and /account/* survive refresh and direct navigation.
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
async function startServer() {
    try {
        await (0, database_1.connectDatabase)();
        console.log('[server] database connection established');
        // Add-only drift healer: sync({force:false}) never adds columns to
        // existing tables, so a model that outgrows its table would 500 every
        // query. Heal first, then let sync create any missing tables.
        const healed = await (0, ensureColumns_1.ensureModelColumns)();
        if (healed.length > 0) {
            console.log(`[server] schema drift healed: ${healed.join(', ')}`);
        }
        await database_1.sequelize.sync({ force: false });
        console.log('[server] models synchronized');
        // First-boot demo seeding (deployment bootstrap): idempotent, only runs
        // when SEED_ON_BOOT=true. Keeps the live DB private — no external seeding.
        if (process.env.SEED_ON_BOOT === 'true') {
            try {
                const { seedDatabase } = await Promise.resolve().then(() => __importStar(require('./scripts/seed')));
                const result = await seedDatabase();
                console.log(`[server] seed complete — services: ${result.services}, barbers: ${result.barbers}, gallery: ${result.gallery}, reviews: ${result.reviews}`);
            }
            catch (seedError) {
                // Seeding must never block the API from serving.
                console.error('[server] seed failed (continuing):', seedError);
            }
        }
        const server = app.listen(env_1.env.port, () => {
            console.log(`[server] running on http://localhost:${env_1.env.port}`);
            console.log(`[server] swagger docs: http://localhost:${env_1.env.port}/api/docs`);
        });
        // A second backend is the most common local mistake, and Express only reports
        // it as a bare "EADDRINUSE" stack trace. Say what actually happened and exit
        // cleanly instead of leaving an unhandled 'error' event to crash the process.
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error([
                    '',
                    `[server] port ${env_1.env.port} is already in use — another SAWABA backend is still running.`,
                    '        Only one backend can bind the port, and the Vite dev proxy targets exactly this one.',
                    '',
                    '  Find it:   netstat -ano | findstr :' + env_1.env.port,
                    '  Stop it:   taskkill /PID <pid> /F',
                    '  Or free it: set PORT to something else in backend/.env',
                    '',
                ].join('\n'));
                process.exit(1);
            }
            throw err;
        });
    }
    catch (error) {
        console.error('[server] failed to start:', error);
        process.exit(1);
    }
}
void startServer();
//# sourceMappingURL=server.js.map