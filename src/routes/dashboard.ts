import { Router } from 'express'
import { dashboardHandler } from '../controllers/dashboardController'
import { requireAdmin } from '../middleware/auth'

export const dashboardRouter = Router()

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
dashboardRouter.get('/', requireAdmin, dashboardHandler)