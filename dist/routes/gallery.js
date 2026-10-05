"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.galleryRouter = void 0;
const express_1 = require("express");
const galleryController_1 = require("../controllers/galleryController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const upload_1 = require("../utils/upload");
const gallery_1 = require("../validators/gallery");
const appointment_1 = require("../validators/appointment");
exports.galleryRouter = (0, express_1.Router)();
/**
 * @swagger
 * /api/gallery:
 *   get:
 *     tags: [Gallery]
 *     summary: List gallery images
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [HAIRCUT, FADE, BEARD, STYLING, KIDS, SALON]
 *       - in: query
 *         name: barberId
 *         schema:
 *           type: integer
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
 *         description: Paginated gallery items.
 */
exports.galleryRouter.get('/', (0, validate_1.validate)(gallery_1.listGalleryQuerySchema, 'query'), galleryController_1.listGalleryHandler);
/**
 * @swagger
 * /api/gallery:
 *   post:
 *     tags: [Gallery]
 *     summary: Add a gallery image (admin)
 *     description: Accepts multipart/form-data with an image file, or JSON with an image URL.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - image
 *             properties:
 *               title:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [HAIRCUT, FADE, BEARD, STYLING, KIDS, SALON]
 *               barberId:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Gallery item created.
 */
exports.galleryRouter.post('/', auth_1.requireAdmin, upload_1.upload.single('image'), (0, validate_1.validate)(gallery_1.createGallerySchema), galleryController_1.createGalleryHandler);
/**
 * @swagger
 * /api/gallery/{id}:
 *   get:
 *     tags: [Gallery]
 *     summary: Get a gallery item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Gallery item details.
 */
exports.galleryRouter.get('/:id', (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), galleryController_1.getGalleryByIdHandler);
/**
 * @swagger
 * /api/gallery/{id}:
 *   put:
 *     tags: [Gallery]
 *     summary: Update a gallery item (admin)
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
 *               title:
 *                 type: string
 *               category:
 *                 type: string
 *               barberId:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Gallery item updated.
 */
exports.galleryRouter.put('/:id', auth_1.requireAdmin, upload_1.upload.single('image'), (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), (0, validate_1.validate)(gallery_1.updateGallerySchema), galleryController_1.updateGalleryHandler);
/**
 * @swagger
 * /api/gallery/{id}:
 *   delete:
 *     tags: [Gallery]
 *     summary: Delete a gallery item (admin)
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
 *         description: Gallery item deleted.
 */
exports.galleryRouter.delete('/:id', auth_1.requireAdmin, (0, validate_1.validate)(appointment_1.idParamsSchema, 'params'), galleryController_1.deleteGalleryHandler);
//# sourceMappingURL=gallery.js.map