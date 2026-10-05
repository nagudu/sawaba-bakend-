"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRouter = void 0;
const express_1 = require("express");
const dashboardController_1 = require("../controllers/dashboardController");
const auth_1 = require("../middleware/auth");
exports.dashboardRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     tags: [Admin]
 *     summary: Admin dashboard metrics
 *     description: Aggregated counts plus the 8 most recent appointments.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totals:
 *                   type: object
 *                   properties:
 *                     appointments:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     confirmed:
 *                       type: integer
 *                     completed:
 *                       type: integer
 *                     cancelled:
 *                       type: integer
 *                     customers:
 *                       type: integer
 *                     barbers:
 *                       type: integer
 *                     services:
 *                       type: integer
 *                 recentAppointments:
 *                   type: array
 *                   items:
 *                     type: object
 */
exports.dashboardRouter.get('/', auth_1.requireAdmin, dashboardController_1.dashboardHandler);
//# sourceMappingURL=dashboard.js.map