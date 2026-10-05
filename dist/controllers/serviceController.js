"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServiceHandler = createServiceHandler;
exports.listServicesHandler = listServicesHandler;
exports.getServiceByIdHandler = getServiceByIdHandler;
exports.updateServiceHandler = updateServiceHandler;
exports.deleteServiceHandler = deleteServiceHandler;
const serviceService_1 = require("../services/serviceService");
const response_1 = require("../utils/response");
const upload_1 = require("../utils/upload");
async function createServiceHandler(req, res, next) {
    try {
        const uploadedImage = req.file ? await (0, upload_1.uploadImageToCloudinary)(req.file.buffer, 'sawaba-services', req.file.mimetype) : null;
        const input = {
            ...req.body,
            image: req.body.image ?? uploadedImage?.url ?? null,
        };
        const service = await (0, serviceService_1.createService)(input);
        (0, response_1.successRes)(res, 'Service created successfully.', service, 201);
    }
    catch (error) {
        next(error);
    }
}
async function listServicesHandler(req, res, next) {
    try {
        const query = req.query;
        const result = await (0, serviceService_1.listServices)(query);
        (0, response_1.successRes)(res, 'Services retrieved.', result, 200);
    }
    catch (error) {
        next(error);
    }
}
async function getServiceByIdHandler(req, res, next) {
    try {
        const id = Number(req.params.id);
        const service = await (0, serviceService_1.getServiceById)(id);
        (0, response_1.successRes)(res, 'Service retrieved.', service, 200);
    }
    catch (error) {
        next(error);
    }
}
async function updateServiceHandler(req, res, next) {
    try {
        const id = Number(req.params.id);
        const uploadedImage = req.file ? await (0, upload_1.uploadImageToCloudinary)(req.file.buffer, 'sawaba-services', req.file.mimetype) : null;
        const existing = await (0, serviceService_1.getServiceById)(id);
        const input = {
            ...req.body,
            image: req.body.image ?? uploadedImage?.url ?? existing.image,
        };
        const service = await (0, serviceService_1.updateService)(id, input);
        // Clean up the replaced upload (only when the image actually changed).
        if (uploadedImage && existing.image && existing.image !== service.image) {
            await (0, upload_1.deleteImageByUrl)(existing.image).catch(() => undefined);
        }
        (0, response_1.successRes)(res, 'Service updated successfully.', service, 200);
    }
    catch (error) {
        next(error);
    }
}
async function deleteServiceHandler(req, res, next) {
    try {
        const id = Number(req.params.id);
        await (0, serviceService_1.deleteService)(id);
        (0, response_1.successRes)(res, 'Service deleted successfully.', {}, 200);
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=serviceController.js.map