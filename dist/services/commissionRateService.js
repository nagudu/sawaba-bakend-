"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCommissionRates = listCommissionRates;
exports.getCommissionRateHistory = getCommissionRateHistory;
exports.updateCommissionRate = updateCommissionRate;
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
function serializeRateRow(barber) {
    return {
        barberId: barber.id,
        name: barber.name,
        barberType: barber.barberType ?? 'INTERNAL',
        commissionType: barber.commissionType ?? 'PERCENTAGE',
        commissionValue: Number(barber.commissionValue ?? 0),
        portalEnabled: Boolean(barber.portalEnabled),
    };
}
function serializeHistoryItem(row, changedByAdminName) {
    return {
        id: row.id,
        barberId: row.barberId,
        commissionType: row.commissionType,
        commissionValue: Number(row.commissionValue),
        effectiveFrom: row.effectiveFrom,
        changedByAdminId: row.changedByAdminId ?? null,
        changedByAdminName,
        createdAt: row.createdAt,
    };
}
async function listCommissionRates(query) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const where = {};
    if (query.commissionType)
        where.commissionType = query.commissionType;
    if (query.search) {
        Object.assign(where, {
            [sequelize_1.Op.or]: [
                { name: { [sequelize_1.Op.like]: `%${query.search}%` } },
                { location: { [sequelize_1.Op.like]: `%${query.search}%` } },
            ],
        });
    }
    const { rows, count } = await models_1.Barber.findAndCountAll({
        where,
        order: [['name', 'ASC']],
        offset,
        limit,
    });
    return { items: rows.map(serializeRateRow), total: count, page, perPage };
}
async function getCommissionRateHistory(barberId, query) {
    const barber = await models_1.Barber.findByPk(barberId);
    if (!barber)
        throw new errors_1.NotFoundError('Barber not found.');
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const { rows, count } = await models_1.CommissionRateHistory.findAndCountAll({
        where: { barberId },
        order: [['effectiveFrom', 'DESC']],
        offset,
        limit,
    });
    return Promise.all(rows.map(async (row) => serializeHistoryItem(row, await resolveAdminName(row.changedByAdminId)))).then((items) => ({ items, total: count, page, perPage }));
}
async function resolveAdminName(adminId) {
    if (!adminId)
        return null;
    const admin = await models_1.Admin.findByPk(adminId, { attributes: ['name'] });
    return admin?.name ?? null;
}
async function updateCommissionRate(barberId, changedByAdminId, input) {
    const barber = await models_1.Barber.findByPk(barberId);
    if (!barber)
        throw new errors_1.NotFoundError('Barber not found.');
    const nextType = input.commissionType ?? (barber.commissionType ?? 'PERCENTAGE');
    const nextValue = input.commissionValue ?? Number(barber.commissionValue ?? 0);
    if (!Number.isFinite(nextValue) || nextValue < 0) {
        throw new errors_1.UnprocessableError('Commission value must be a non-negative number.');
    }
    if (nextType === 'PERCENTAGE' && nextValue > 100) {
        throw new errors_1.UnprocessableError('Percentage commission must be between 0 and 100.');
    }
    await barber.update({ commissionType: nextType, commissionValue: nextValue });
    await models_1.CommissionRateHistory.create({
        barberId,
        commissionType: nextType,
        commissionValue: nextValue,
        effectiveFrom: input.effectiveFrom ?? new Date(),
        changedByAdminId,
    });
    return serializeRateRow(barber);
}
//# sourceMappingURL=commissionRateService.js.map