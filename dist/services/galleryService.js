"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGallery = createGallery;
exports.listGallery = listGallery;
exports.getGalleryById = getGalleryById;
exports.updateGalleryItem = updateGalleryItem;
exports.deleteGalleryItem = deleteGalleryItem;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const upload_1 = require("../utils/upload");
const withBarber = {
    barber: { select: { id: true, name: true } },
};
function serializeGallery(image) {
    return {
        id: image.id,
        title: image.title,
        image: image.image,
        video: image.video,
        mediaType: image.mediaType,
        duration: image.duration,
        category: image.category,
        barberId: image.barberId ?? null,
        createdAt: image.createdAt,
        updatedAt: image.updatedAt,
        barber: image.barber ? { id: image.barber.id, name: image.barber.name } : null,
    };
}
async function createGallery(input, media = {}) {
    if (input.barberId) {
        const barber = await database_1.prisma.barber.findUnique({
            where: { id: input.barberId },
            select: { id: true },
        });
        if (!barber) {
            throw new errors_1.NotFoundError('Linked barber does not exist.');
        }
    }
    const mediaType = input.mediaType ?? (input.video ? 'VIDEO' : 'IMAGE');
    if (mediaType === 'VIDEO') {
        if (!input.video) {
            throw new errors_1.AppError('A video file or URL is required for a video gallery item.', 400);
        }
    }
    else if (!input.image) {
        throw new errors_1.AppError('An image is required. Upload a file or provide an image URL.', 400);
    }
    const created = await database_1.prisma.gallery.create({
        data: {
            title: input.title,
            category: input.category,
            mediaType,
            barberId: input.barberId ?? null,
            image: input.image ?? null,
            video: input.video ?? null,
            videoPublicId: media.videoPublicId ?? null,
            duration: input.duration ?? null,
        },
        select: { id: true },
    });
    return getGalleryById(created.id);
}
async function listGallery(query) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const where = {
        ...(query.category ? { category: query.category } : {}),
        ...(query.mediaType ? { mediaType: query.mediaType } : {}),
        ...(query.barberId ? { barberId: query.barberId } : {}),
    };
    const [rows, total] = await database_1.prisma.$transaction([
        database_1.prisma.gallery.findMany({
            where,
            include: withBarber,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
        }),
        database_1.prisma.gallery.count({ where }),
    ]);
    return { items: rows.map(serializeGallery), total, page, perPage };
}
async function getGalleryById(id) {
    const image = await database_1.prisma.gallery.findUnique({ where: { id }, include: withBarber });
    if (!image) {
        throw new errors_1.NotFoundError('Gallery item not found.');
    }
    return serializeGallery(image);
}
async function updateGalleryItem(id, input, media = {}) {
    const image = await database_1.prisma.gallery.findUnique({ where: { id }, select: { id: true } });
    if (!image) {
        throw new errors_1.NotFoundError('Gallery item not found.');
    }
    if (input.barberId) {
        const barber = await database_1.prisma.barber.findUnique({
            where: { id: input.barberId },
            select: { id: true },
        });
        if (!barber) {
            throw new errors_1.NotFoundError('Linked barber does not exist.');
        }
    }
    await database_1.prisma.gallery.update({
        where: { id },
        data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.category !== undefined ? { category: input.category } : {}),
            ...(input.mediaType !== undefined ? { mediaType: input.mediaType } : {}),
            ...(input.barberId !== undefined ? { barberId: input.barberId } : {}),
            ...(input.image !== undefined ? { image: input.image } : {}),
            ...(input.video !== undefined ? { video: input.video } : {}),
            ...(media.videoPublicId !== undefined ? { videoPublicId: media.videoPublicId } : {}),
            ...(input.duration !== undefined ? { duration: input.duration } : {}),
        },
    });
    return getGalleryById(id);
}
async function deleteGalleryItem(id) {
    const item = await database_1.prisma.gallery.findUnique({
        where: { id },
        select: { image: true, video: true },
    });
    if (!item) {
        throw new errors_1.NotFoundError('Gallery item not found.');
    }
    await Promise.all([
        (0, upload_1.deleteImageByUrl)(item.image ?? '').catch(() => undefined),
        (0, upload_1.deleteVideoByUrl)(item.video ?? '').catch(() => undefined),
    ]);
    await database_1.prisma.gallery.delete({ where: { id } });
}
//# sourceMappingURL=galleryService.js.map