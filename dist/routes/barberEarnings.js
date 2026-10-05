"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignmentRouter = exports.barberEarningsRouter = void 0;
const express_1 = require("express");
const barberEarningController_1 = require("../controllers/barberEarningController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const appointment_1 = require("../validators/appointment");
const barberEarning_1 = require("../validators/barberEarning");
/** Every route here is admin-only — commission data never leaks publicly (#22/#23). */
exports.barberEarningsRouter = (0, express_1.Router)();
exports.barberEarningsRouter.use(auth_1.requireAdmin);
exports.barberEarningsRouter.get('/', (0, validate_1.validate)(barberEarning_1.earningsQuerySchema, 'query'), barberEarningController_1.listEarningsHandler);
exports.barberEarningsRouter.get('/summary', (0, validate_1.validate)(barberEarning_1.earningsQuerySchema, 'query'), barberEarningController_1.earningsSummaryHandler);
exports.barberEarningsRouter.get('/report', (0, validate_1.validate)(barberEarning_1.earningsQuerySchema, 'query'), barberEarningController_1.commissionReportHandler);
exports.barberEarningsRouter.get('/performance', (0, validate_1.validate)(barberEarning_1.earningsQuerySchema, 'query'), barberEarningController_1.barberPerformanceHandler);
exports.barberEarningsRouter.post('/:id/paid', (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), (0, validate_1.validate)(barberEarning_1.markPaidSchema), barberEarningController_1.markEarningPaidHandler);
/** Appointment assignment endpoints (mounted under /api/admin/barber-earnings for cohesion). */
exports.assignmentRouter = (0, express_1.Router)();
exports.assignmentRouter.use(auth_1.requireAdmin);
exports.assignmentRouter.put('/:id/assign-barber', (0, validate_1.validate)(barberEarning_1.assignBarberParamsSchema, 'params'), (0, validate_1.validate)(barberEarning_1.assignBarberSchema), barberEarningController_1.assignBarberHandler);
exports.assignmentRouter.get('/:id/assignment-history', (0, validate_1.validate)(barberEarning_1.assignBarberParamsSchema, 'params'), barberEarningController_1.assignmentHistoryHandler);
//# sourceMappingURL=barberEarnings.js.map