"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGallery = createGallery;
exports.listGallery = listGallery;
exports.getGalleryById = getGalleryById;
exports.updateGalleryItem = updateGalleryItem;
exports.deleteGalleryItem = deleteGalleryItem;
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const upload_1 = require("../utils/upload");
function serializeGallery(image) {
    return {
        id: image.id,
        title: image.title,
        image: image.image,
        category: image.category,
        barberId: image.barberId ?? null,
        createdAt: image.createdAt,
        updatedAt: image.updatedAt,
        barber: image.barber ? { id: image.barber.id, name: image.barber.name } : null,
    };
}
async function createGallery(input) {
    if (input.barberId) {
        const barber = await models_1.Barber.findByPk(input.barberId);
        if (!barber) {
            throw new errors_1.NotFoundError('Linked barber does not exist.');
        }
    }
    if (!input.image) {
        throw new errors_1.AppError('An image is required. Upload a file or provide an image URL.', 400);
    }
    const image = await models_1.Gallery.create({
        title: input.title,
        category: input.category,
        barberId: input.barberId ?? null,
        image: input.image,
    });
    return getGalleryById(image.id);
}
async function listGallery(query) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const where = {};
    if (query.category)
        where.category = query.category;
    if (query.barberId)
        where.barberId = query.barberId;
    const { rows, count } = await models_1.Gallery.findAndCountAll({
        where,
        include: [{ model: models_1.Barber, as: 'barber', attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
        offset,
        limit,
    });
    return { items: rows.map(serializeGallery), total: count, page, perPage };
}
async function getGalleryById(id) {
    const image = await models_1.Gallery.findByPk(id, {
        include: [{ model: models_1.Barber, as: 'barber', attributes: ['id', 'name'] }],
    });
    if (!image) {
        throw new errors_1.NotFoundError('Gallery item not found.');
    }
    return serializeGallery(image);
}
async function updateGalleryItem(id, input) {
    const image = await models_1.Gallery.findByPk(id);
    if (!image) {
        throw new errors_1.NotFoundError('Gallery item not found.');
    }
    if (input.barberId) {
        const barber = await models_1.Barber.findByPk(input.barberId);
        if (!barber) {
            throw new errors_1.NotFoundError('Linked barber does not exist.');
        }
    }
    const changes = {};
    if (input.title !== undefined)
        changes.title = input.title;
    if (input.category !== undefined)
        changes.category = input.category;
    if (input.barberId !== undefined)
        changes.barberId = input.barberId;
    if (input.image !== undefined && input.image !== null) {
        changes.image = input.image;
    }
    await image.update(changes);
    return getGalleryById(id);
}
async function deleteGalleryItem(id) {
    const image = await models_1.Gallery.findByPk(id);
    if (!image) {
        throw new errors_1.NotFoundError('Gallery item not found.');
    }
    await (0, upload_1.deleteImageByUrl)(image.image).catch(() => undefined);
    await image.destroy();
}
//# sourceMappingURL=galleryService.js.map