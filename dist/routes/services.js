"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.servicesRouter = void 0;
const express_1 = require("express");
const serviceController_1 = require("../controllers/serviceController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const upload_1 = require("../utils/upload");
const service_1 = require("../validators/service");
exports.servicesRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/services:
 *   get:
 *     tags: [Services]
 *     summary: List services
 *     description: Public endpoint returning active services (paginated).
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by service category.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated list of services.
 */
exports.servicesRouter.get('/', (0, validate_1.validate)(service_1.listServicesQuerySchema, 'query'), serviceController_1.listServicesHandler);
/**
 * @swagger
 * /api/services:
 *   post:
 *     tags: [Services]
 *     summary: Create a service
 *     description: Admin only. Accepts JSON or multipart/form-data with an optional image file.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - duration
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               duration:
 *                 type: integer
 *                 description: Duration in minutes.
 *               category:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Service created.
 */
exports.servicesRouter.post('/', auth_1.requireAdmin, upload_1.upload.single('image'), (0, validate_1.validate)(service_1.createServiceSchema), serviceController_1.createServiceHandler);
/**
 * @swagger
 * /api/services/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Get a single service
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Service details.
 */
exports.servicesRouter.get('/:id', (0, validate_1.validate)(service_1.serviceIdParamsSchema, 'params'), serviceController_1.getServiceByIdHandler);
/**
 * @swagger
 * /api/services/{id}:
 *   put:
 *     tags: [Services]
 *     summary: Update a service
 *     description: Admin only. Accepts JSON or multipart/form-data with an optional image file.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               duration:
 *                 type: integer
 *               category:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Service updated.
 */
exports.servicesRouter.put('/:id', auth_1.requireAdmin, upload_1.upload.single('image'), (0, validate_1.validate)(service_1.serviceIdParamsSchema, 'params'), (0, validate_1.validate)(service_1.updateServiceSchema), serviceController_1.updateServiceHandler);
/**
 * @swagger
 * /api/services/{id}:
 *   delete:
 *     tags: [Services]
 *     summary: Delete a service
 *     description: Admin only. Fails if the service has appointments.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Service deleted.
 */
exports.servicesRouter.delete('/:id', auth_1.requireAdmin, (0, validate_1.validate)(service_1.serviceIdParamsSchema, 'params'), serviceController_1.deleteServiceHandler);
//# sourceMappingURL=services.js.map