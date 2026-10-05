"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customersRouter = void 0;
const express_1 = require("express");
const customerAdminController_1 = require("../controllers/customerAdminController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const customer_1 = require("../validators/customer");
const zod_1 = require("zod");
exports.customersRouter = (0, express_1.Router)();
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
exports.customersRouter.get('/', auth_1.requireAdmin, (0, validate_1.validate)(customer_1.listCustomersQuerySchema, 'query'), customerAdminController_1.listHandler);
/**
 * @swagger
 * /api/admin/customers/reminders/due:
 *   post:
 *     tags: [Admin]
 *     summary: Send booking reminders to due regulars (admin)
 *     description: Emails opt-in customers whose average visit gap has elapsed. Never auto-books.
 */
exports.customersRouter.post('/reminders/due', auth_1.requireAdmin, customerAdminController_1.remindHandler);
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
exports.customersRouter.get('/:id', auth_1.requireAdmin, customerAdminController_1.detailHandler);
exports.customersRouter.patch('/:id', auth_1.requireAdmin, (0, validate_1.validate)(customer_1.updateCustomerSchema), customerAdminController_1.updateHandler);
// zod import guard
void zod_1.z;
//# sourceMappingURL=customers.js.map