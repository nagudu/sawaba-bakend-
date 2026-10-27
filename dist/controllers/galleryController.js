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
/** Pulls the first uploaded file for a given multipart field, if any. */
function firstUploadedFile(files, field) {
    if (!files || Array.isArray(files))
        return null;
    const bucket = files[field];
    return bucket && bucket.length > 0 ? bucket[0] : null;
}
/** Multer's request-wide limit is the (larger) video ceiling, so re-check the poster. */
function assertImageWithinLimit(file) {
    if (file && file.size > upload_1.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        throw new errors_1.AppError(`Image is too large. Maximum allowed size is ${upload_1.MAX_IMAGE_SIZE_MB}MB.`, 400);
    }
}
function bodyString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
async function createGalleryHandler(req, res, next) {
    try {
        const imageFile = firstUploadedFile(req.files, 'image');
        const videoFile = firstUploadedFile(req.files, 'video');
        assertImageWithinLimit(imageFile);
        const uploadedVideo = videoFile
            ? await (0, upload_1.uploadVideoToCloudinary)(videoFile.buffer, 'sawaba-gallery/videos', videoFile.mimetype)
            : null;
        const uploadedImage = imageFile
            ? await (0, upload_1.uploadImageToCloudinary)(imageFile.buffer, 'sawaba-gallery', imageFile.mimetype)
            : null;
        const bodyImage = bodyString(req.body.image);
        const bodyVideo = bodyString(req.body.video);
        const mediaType = req.body.mediaType ??
            (uploadedVideo || bodyVideo ? 'VIDEO' : 'IMAGE');
        const image = bodyImage ??
            uploadedImage?.url ??
            (mediaType === 'VIDEO' ? uploadedVideo?.thumbnailUrl ?? null : null);
        const video = bodyVideo ?? uploadedVideo?.url ?? null;
        const input = {
            title: req.body.title,
            category: req.body.category,
            mediaType,
            barberId: req.body.barberId ? Number(req.body.barberId) : null,
            image,
            video,
            duration: req.body.duration,
        };
        const item = await (0, galleryService_1.createGallery)(input, { videoPublicId: uploadedVideo?.publicId ?? null });
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
        const existing = await (0, galleryService_1.getGalleryById)(id);
        const imageFile = firstUploadedFile(req.files, 'image');
        const videoFile = firstUploadedFile(req.files, 'video');
        assertImageWithinLimit(imageFile);
        const uploadedVideo = videoFile
            ? await (0, upload_1.uploadVideoToCloudinary)(videoFile.buffer, 'sawaba-gallery/videos', videoFile.mimetype)
            : null;
        const uploadedImage = imageFile
            ? await (0, upload_1.uploadImageToCloudinary)(imageFile.buffer, 'sawaba-gallery', imageFile.mimetype)
            : null;
        const bodyImage = bodyString(req.body.image);
        const bodyVideo = bodyString(req.body.video);
        const mediaType = req.body.mediaType ??
            (uploadedVideo || bodyVideo ? 'VIDEO' : uploadedImage || bodyImage ? 'IMAGE' : undefined);
        const image = bodyImage ??
            uploadedImage?.url ??
            (mediaType === 'VIDEO' ? uploadedVideo?.thumbnailUrl ?? undefined : undefined);
        const video = bodyVideo ?? uploadedVideo?.url ?? undefined;
        const input = {
            ...(req.body.title !== undefined ? { title: req.body.title } : {}),
            ...(req.body.category !== undefined ? { category: req.body.category } : {}),
            ...(mediaType !== undefined ? { mediaType } : {}),
            ...(req.body.barberId !== undefined
                ? { barberId: req.body.barberId === '' || req.body.barberId === null ? null : Number(req.body.barberId) }
                : {}),
            ...(image !== undefined ? { image } : {}),
            ...(video !== undefined ? { video } : {}),
            ...(req.body.duration !== undefined ? { duration: req.body.duration } : {}),
        };
        const item = await (0, galleryService_1.updateGalleryItem)(id, input, {
            ...(uploadedVideo ? { videoPublicId: uploadedVideo.publicId } : {}),
        });
        if ((uploadedImage || bodyImage) && existing.image && existing.image !== item.image) {
            await (0, upload_1.deleteImageByUrl)(existing.image).catch(() => undefined);
        }
        if ((uploadedVideo || bodyVideo) && existing.video && existing.video !== item.video) {
            await (0, upload_1.deleteVideoByUrl)(existing.video).catch(() => undefined);
        }
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