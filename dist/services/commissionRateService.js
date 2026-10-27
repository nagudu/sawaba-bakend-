"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCommissionRates = listCommissionRates;
exports.getCommissionRateHistory = getCommissionRateHistory;
exports.updateCommissionRate = updateCommissionRate;
const database_1 = require("../config/database");
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
        const search = query.search;
        where.OR = [
            { name: { contains: search } },
            { location: { contains: search } },
        ];
    }
    const [rows, count] = await Promise.all([
        database_1.prisma.barber.findMany({
            where,
            orderBy: { name: 'asc' },
            skip: offset,
            take: limit,
        }),
        database_1.prisma.barber.count({ where }),
    ]);
    return { items: rows.map(serializeRateRow), total: count, page, perPage };
}
async function getCommissionRateHistory(barberId, query) {
    const barber = await database_1.prisma.barber.findUnique({ where: { id: barberId } });
    if (!barber)
        throw new errors_1.NotFoundError('Barber not found.');
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const [rows, count] = await Promise.all([
        database_1.prisma.commissionRateHistory.findMany({
            where: { barberId },
            include: { changedBy: { select: { name: true } } },
            orderBy: { effectiveFrom: 'desc' },
            skip: offset,
            take: limit,
        }),
        database_1.prisma.commissionRateHistory.count({ where: { barberId } }),
    ]);
    return {
        items: rows.map((row) => serializeHistoryItem(row, row.changedBy?.name ?? null)),
        total: count,
        page,
        perPage,
    };
}
async function updateCommissionRate(barberId, changedByAdminId, input) {
    const barber = await database_1.prisma.barber.findUnique({ where: { id: barberId } });
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
    const [updatedBarber] = await database_1.prisma.$transaction([
        database_1.prisma.barber.update({
            where: { id: barberId },
            data: { commissionType: nextType, commissionValue: nextValue },
        }),
        database_1.prisma.commissionRateHistory.create({
            data: {
                barberId,
                commissionType: nextType,
                commissionValue: nextValue,
                effectiveFrom: input.effectiveFrom ?? new Date(),
                changedByAdminId,
            },
        }),
    ]);
    return serializeRateRow(updatedBarber);
}
//# sourceMappingURL=commissionRateService.js.map