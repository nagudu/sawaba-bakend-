"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeService = serializeService;
exports.createService = createService;
exports.listServices = listServices;
exports.getServiceById = getServiceById;
exports.updateService = updateService;
exports.deleteService = deleteService;
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const slug_1 = require("../utils/slug");
const response_1 = require("../utils/response");
function serializeService(service) {
    return {
        id: service.id,
        name: service.name,
        slug: service.slug,
        description: service.description,
        price: Number(service.price),
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
    while (true) {
        const existing = await models_1.Service.findOne({
            where: excludeId
                ? { slug: candidate, id: { [sequelize_1.Op.not]: excludeId } }
                : { slug: candidate },
        });
        if (!existing)
            return candidate;
        candidate = `${base}-${counter}`;
        counter += 1;
    }
}
async function createService(input) {
    const slug = await uniqueSlug(input.name);
    const service = await models_1.Service.create({ ...input, slug });
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
                [sequelize_1.Op.or]: [
                    { name: { [sequelize_1.Op.like]: `%${query.search}%` } },
                    { slug: { [sequelize_1.Op.like]: `%${query.search}%` } },
                    { description: { [sequelize_1.Op.like]: `%${query.search}%` } },
                ],
            }
            : {}),
    };
    const { rows, count } = await models_1.Service.findAndCountAll({
        where,
        order: [['name', 'ASC']],
        offset,
        limit,
    });
    return {
        items: rows.map(serializeService),
        total: count,
        page,
        perPage,
    };
}
async function getServiceById(id) {
    const service = await models_1.Service.findByPk(id);
    if (!service) {
        throw new errors_1.NotFoundError('Service not found.');
    }
    return serializeService(service);
}
async function updateService(id, input) {
    const service = await models_1.Service.findByPk(id);
    if (!service) {
        throw new errors_1.NotFoundError('Service not found.');
    }
    const changes = { ...input };
    if (input.name && input.name !== service.name) {
        changes.slug = await uniqueSlug(input.name, id);
    }
    await service.update(changes);
    return serializeService(service);
}
async function deleteService(id) {
    const service = await models_1.Service.findByPk(id);
    if (!service) {
        throw new errors_1.NotFoundError('Service not found.');
    }
    const appointmentCount = await models_1.Appointment.count({ where: { serviceId: id } });
    if (appointmentCount > 0) {
        throw new errors_1.ConflictError('This service has appointments attached. Deactivate it instead of deleting.');
    }
    await service.destroy();
}
//# sourceMappingURL=serviceService.js.map