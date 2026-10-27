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
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const reminderService_1 = require("./services/reminderService");
async function startServer() {
    try {
        await (0, database_1.connectDatabase)();
        console.log('[server] database connection established');
        // First-boot demo seeding (deployment bootstrap): idempotent, only runs
        // when SEED_ON_BOOT=true. Keeps the live DB private — no external seeding.
        if (process.env.SEED_ON_BOOT === 'true') {
            try {
                const { seedDatabase } = await Promise.resolve().then(() => __importStar(require('./scripts/seed')));
                const result = await seedDatabase();
                console.log(`[server] seed complete — services: ${result.services}, barbers: ${result.barbers}, gallery: ${result.gallery}, reviews: ${result.reviews}`);
            }
            catch (seedError) {
                console.error('[server] seed failed (continuing):', seedError);
            }
        }
        const server = app_1.app.listen(env_1.env.port, () => {
            console.log(`[server] running on http://localhost:${env_1.env.port}`);
            console.log(`[server] swagger docs: http://localhost:${env_1.env.port}/api/docs`);
        });
        // Automatic appointment reminders on long-lived hosts (Vercel uses cron).
        (0, reminderService_1.startReminderScheduler)();
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error([
                    '',
                    `[server] port ${env_1.env.port} is already in use (on macOS, AirPlay often uses 5000; or another backend is running).`,
                    '        Only one backend can bind the port, and the Vite dev proxy targets exactly this one.',
                    '',
                    '  Mac/Linux: lsof -ti:' + env_1.env.port + ' | xargs kill -9',
                    '  Windows:   netstat -ano | findstr :' + env_1.env.port + ' && taskkill /PID <pid> /F',
                    '  Or free it: set PORT to something else in backend/.env (e.g. PORT=5001)',
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