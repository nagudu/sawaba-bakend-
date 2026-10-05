"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGalleryHandler = createGalleryHandler;
exports.listGalleryHandler = listGalleryHandler;
exports.getGalleryByIdHandler = getGalleryByIdHandler;
exports.updateGalleryHandler = updateGalleryHandler;
exports.deleteGalleryHandler = deleteGalleryHandler;
const galleryService_1 = require("../services/galleryService");
const response_1 = require("../utils/response");
const upload_1 = require("../utils/upload");
const errors_1 = require("../utils/errors");
async function createGalleryHandler(req, res, next) {
    try {
        const uploadedImage = req.file ? await (0, upload_1.uploadImageToCloudinary)(req.file.buffer, 'sawaba-gallery', req.file.mimetype) : null;
        const input = {
            ...req.body,
            image: req.body.image ?? uploadedImage?.url ?? null,
            barberId: req.body.barberId ? Number(req.body.barberId) : null,
        };
        if (!input.image) {
            throw new errors_1.AppError('An image is required. Upload a file or provide an image URL.', 400);
        }
        const item = await (0, galleryService_1.createGallery)(input);
        (0, response_1.successRes)(res, 'Gallery item created successfully.', item, 201);
    }
    catch (error) {
        next(error);
    }
}
async function listGalleryHandler(req, res, next) {
    try {
        const query = req.query;
        const result = await (0, galleryService_1.listGallery)(query);
        (0, response_1.successRes)(res, 'Gallery retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function getGalleryByIdHandler(req, res, next) {
    try {
        const item = await (0, galleryService_1.getGalleryById)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Gallery item retrieved.', item, 200);
    }
    catch (error) {
        next(error);
    }
}
async function updateGalleryHandler(req, res, next) {
    try {
        const id = Number(req.params.id);
        const uploadedImage = req.file ? await (0, upload_1.uploadImageToCloudinary)(req.file.buffer, 'sawaba-gallery', req.file.mimetype) : null;
        const input = {
            ...req.body,
            image: req.body.image ?? uploadedImage?.url ?? undefined,
            barberId: req.body.barberId === undefined || req.body.barberId === null || req.body.barberId === '' ? null : Number(req.body.barberId),
        };
        const item = await (0, galleryService_1.updateGalleryItem)(id, input);
        (0, response_1.successRes)(res, 'Gallery item updated successfully.', item, 200);
    }
    catch (error) {
        next(error);
    }
}
async function deleteGalleryHandler(req, res, next) {
    try {
        await (0, galleryService_1.deleteGalleryItem)(Number(req.params.id));
        (0, response_1.successRes)(res, 'Gallery item deleted successfully.', {}, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=galleryController.js.map