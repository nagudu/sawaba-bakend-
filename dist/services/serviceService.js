"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeService = serializeService;
exports.createService = createService;
exports.listServices = listServices;
exports.getServiceById = getServiceById;
exports.updateService = updateService;
exports.deleteService = deleteService;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const slug_1 = require("../utils/slug");
const response_1 = require("../utils/response");
function serializeService(service) {
    return {
        id: service.id,
        name: service.name,
        slug: service.slug,
        description: service.description,
        price: service.price.toNumber(),
        duration: service.duration,
        image: service.image,
        category: service.category,
        isActive: service.isActive,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
    };
}
async function uniqueSlug(name, excludeId) {
    const base = (0, slug_1.slugify)(name);
    let candidate = base;
    let counter = 2;
    for (;;) {
        const existing = await database_1.prisma.service.findFirst({
            where: excludeId ? { slug: candidate, id: { not: excludeId } } : { slug: candidate },
            select: { id: true },
        });
        if (!existing)
            return candidate;
        candidate = `${base}-${counter}`;
        counter += 1;
    }
}
async function createService(input) {
    const slug = await uniqueSlug(input.name);
    const service = await database_1.prisma.service.create({ data: { ...input, slug } });
    return serializeService(service);
}
async function listServices(query, includeInactive = false) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const where = {
        ...(query.category ? { category: query.category } : {}),
        ...(!includeInactive
            ? { isActive: true }
            : query.isActive
                ? { isActive: query.isActive === 'true' }
                : {}),
        ...(query.search
            ? {
                OR: [
                    { name: { contains: query.search } },
                    { slug: { contains: query.search } },
                    { description: { contains: query.search } },
                ],
            }
            : {}),
    };
    const [rows, total] = await database_1.prisma.$transaction([
        database_1.prisma.service.findMany({ where, orderBy: { name: 'asc' }, skip: offset, take: limit }),
        database_1.prisma.service.count({ where }),
    ]);
    return { items: rows.map(serializeService), total, page, perPage };
}
async function getServiceById(id) {
    const service = await database_1.prisma.service.findUnique({ where: { id } });
    if (!service) {
        throw new errors_1.NotFoundError('Service not found.');
    }
    return serializeService(service);
}
async function updateService(id, input) {
    const service = await database_1.prisma.service.findUnique({ where: { id } });
    if (!service) {
        throw new errors_1.NotFoundError('Service not found.');
    }
    const slug = input.name && input.name !== service.name ? await uniqueSlug(input.name, id) : undefined;
    const updated = await database_1.prisma.service.update({
        where: { id },
        data: {
            ...input,
            ...(slug ? { slug } : {}),
        },
    });
    return serializeService(updated);
}
async function deleteService(id) {
    const service = await database_1.prisma.service.findUnique({ where: { id }, select: { id: true } });
    if (!service) {
        throw new errors_1.NotFoundError('Service not found.');
    }
    const appointmentCount = await database_1.prisma.appointment.count({ where: { serviceId: id } });
    if (appointmentCount > 0) {
        throw new errors_1.ConflictError('This service has appointments attached. Deactivate it instead of deleting.');
    }
    await database_1.prisma.service.delete({ where: { id } });
}
//# sourceMappingURL=serviceService.js.map