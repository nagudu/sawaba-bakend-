import { Router } from 'express'
import {
  detailHandler,
  listHandler,
  remindHandler,
  updateHandler,
} from '../controllers/customerAdminController'
import { requireAdmin } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { listCustomersQuerySchema, updateCustomerSchema } from '../validators/customer'
import { z } from 'zod'

export const customersRouter = Router()

/**
 * @swagger
 * /api/admin/customers:
 *   get:
 *     tags: [Admin]
 *     summary: Search customers (admin)
 *     description: Search by name, phone, email or CUS-code; includes per-customer stats.
 *     security:
 *       - bearerAuth: []
 */
customersRouter.get('/', requireAdmin, validate(listCustomersQuerySchema, 'query'), listHandler)

/**
 * @swagger
 * /api/admin/customers/reminders/due:
 *   post:
 *     tags: [Admin]
 *     summary: Send booking reminders to due regulars (admin)
 *     description: Emails opt-in customers whose average visit gap has elapsed. Never auto-books.
 */
customersRouter.post('/reminders/due', requireAdmin, remindHandler)

/**
 * @swagger
 * /api/admin/customers/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Full customer detail (admin)
 *     description: Stats, full booking history, upcoming appointment and favorite services.
 *   patch:
 *     tags: [Admin]
 *     summary: Edit allowed customer fields (admin)
 *     description: Phone (identity anchor) is intentionally not editable.
 */
customersRouter.get('/:id', requireAdmin, detailHandler)
customersRouter.patch('/:id', requireAdmin, validate(updateCustomerSchema), updateHandler)

// zod import guard
void z
