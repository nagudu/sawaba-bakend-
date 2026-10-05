"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactRouter = void 0;
const express_1 = require("express");
const contactController_1 = require("../controllers/contactController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const contact_1 = require("../validators/contact");
const appointment_1 = require("../validators/appointment");
const contact_2 = require("../validators/contact");
exports.contactRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/contact:
 *   post:
 *     tags: [Contact]
 *     summary: Send a contact message (public)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, message]
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent.
 */
exports.contactRouter.post('/', rateLimiter_1.submitLimiter, (0, validate_1.validate)(contact_1.createContactSchema), contactController_1.createContactHandler);
/**
 * @swagger
 * /api/contact:
 *   get:
 *     tags: [Contact]
 *     summary: List contact messages (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: read
 *         schema:
 *           type: string
 *           enum: [true, false, all]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated messages.
 */
exports.contactRouter.get('/', auth_1.requireAdmin, (0, validate_1.validate)(contact_1.listContactQuerySchema, 'query'), contactController_1.listContactHandler);
/**
 * @swagger
 * /api/contact/{id}:
 *   get:
 *     tags: [Contact]
 *     summary: Get a contact message (admin)
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
 *         description: Message details.
 */
exports.contactRouter.get('/:id', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), contactController_1.getContactHandler);
/**
 * @swagger
 * /api/contact/{id}/read:
 *   patch:
 *     tags: [Contact]
 *     summary: Mark a contact message as read/unread (admin)
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isRead]
 *             properties:
 *               isRead:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Status updated.
 */
exports.contactRouter.patch('/:id/read', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), (0, validate_1.validate)(contact_2.markReadSchema), contactController_1.markContactReadHandler);
/**
 * @swagger
 * /api/contact/{id}/status:
 *   patch:
 *     tags: [Contact]
 *     summary: Update a contact message status (admin)
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [NEW, READ, REPLIED, ARCHIVED]
 *     responses:
 *       200:
 *         description: Status updated.
 */
exports.contactRouter.patch('/:id/status', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), (0, validate_1.validate)(contact_2.contactStatusSchema), contactController_1.updateContactStatusHandler);
/**
 * @swagger
 * /api/contact/{id}/reply:
 *   post:
 *     tags: [Contact]
 *     summary: Reply to a contact message by email (admin)
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reply sent and stored.
 */
exports.contactRouter.post('/:id/reply', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), (0, validate_1.validate)(contact_2.replySchema), contactController_1.replyContactHandler);
/**
 * @swagger
 * /api/contact/{id}:
 *   delete:
 *     tags: [Contact]
 *     summary: Delete a contact message (admin)
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
 *         description: Message deleted.
 */
exports.contactRouter.delete('/:id', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), contactController_1.deleteContactHandler);
//# sourceMappingURL=contact.js.map