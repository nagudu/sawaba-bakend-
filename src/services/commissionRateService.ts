import { Op, type WhereOptions } from 'sequelize'
import { Admin, Barber, CommissionRateHistory } from '../models'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'
import type { CommissionType } from '../models/Barber'
import type { Paged } from '../types'

export interface CommissionRateRow {
  barberId: number
  name: string
  barberType: 'INTERNAL' | 'EXTERNAL'
  commissionType: CommissionType
  commissionValue: number
  portalEnabled: boolean
}

export interface CommissionRateHistoryItem {
  id: number
  barberId: number
  commissionType: CommissionType
  commissionValue: number
  effectiveFrom: Date
  changedByAdminId: number | null
  changedByAdminName: string | null
  createdAt: Date
}

export interface CommissionRateSearchInput {
  search?: string
  commissionType?: CommissionType
  page?: unknown
  perPage?: unknown
}

export interface CommissionRateUpdateInput {
  commissionType?: CommissionType
  commissionValue?: number
  effectiveFrom?: Date
}

function serializeRateRow(barber: Barber): CommissionRateRow {
  return {
    barberId: barber.id,
    name: barber.name,
    barberType: (barber.barberType as 'INTERNAL' | 'EXTERNAL') ?? 'INTERNAL',
    commissionType: (barber.commissionType as CommissionType) ?? 'PERCENTAGE',
    commissionValue: Number(barber.commissionValue ?? 0),
    portalEnabled: Boolean(barber.portalEnabled),
  }
}

function serializeHistoryItem(
  row: CommissionRateHistory,
  changedByAdminName: string | null,
): CommissionRateHistoryItem {
  return {
    id: row.id,
    barberId: row.barberId,
    commissionType: row.commissionType as CommissionType,
    commissionValue: Number(row.commissionValue),
    effectiveFrom: row.effectiveFrom,
    changedByAdminId: row.changedByAdminId ?? null,
    changedByAdminName,
    createdAt: row.createdAt,
  }
}

export async function listCommissionRates(
  query: CommissionRateSearchInput,
): Promise<Paged<CommissionRateRow>> {
  const { page, perPage, offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const where: WhereOptions = {}
  if (query.commissionType) where.commissionType = query.commissionType
  if (query.search) {
    Object.assign(where, {
      [Op.or]: [
        { name: { [Op.like]: `%${query.search}%` } },
        { location: { [Op.like]: `%${query.search}%` } },
      ],
    })
  }
  const { rows, count } = await Barber.findAndCountAll({
    where,
    order: [['name', 'ASC']],
    offset,
    limit,
  })
  return { items: rows.map(serializeRateRow), total: count, page, perPage }
}

export async function getCommissionRateHistory(
  barberId: number,
  query: { page?: unknown; perPage?: unknown },
): Promise<Paged<CommissionRateHistoryItem>> {
  const barber = await Barber.findByPk(barberId)
  if (!barber) throw new NotFoundError('Barber not found.')
  const { page, perPage, offset, limit } = getPagination(query as unknown as Record<string, unknown>)
  const { rows, count } = await CommissionRateHistory.findAndCountAll({
    where: { barberId },
    order: [['effectiveFrom', 'DESC']],
    offset,
    limit,
  })
  return Promise.all(rows.map(async (row) => serializeHistoryItem(row, await resolveAdminName(row.changedByAdminId)))).then(
    (items) => ({ items, total: count, page, perPage }),
  )
}

async function resolveAdminName(adminId: number | null | undefined): Promise<string | null> {
  if (!adminId) return null
  const admin = await Admin.findByPk(adminId, { attributes: ['name'] })
  return admin?.name ?? null
}

export async function updateCommissionRate(
  barberId: number,
  changedByAdminId: number,
  input: CommissionRateUpdateInput,
): Promise<CommissionRateRow> {
  const barber = await Barber.findByPk(barberId)
  if (!barber) throw new NotFoundError('Barber not found.')
  const nextType = input.commissionType ?? ((barber.commissionType as CommissionType) ?? 'PERCENTAGE')
  const nextValue = input.commissionValue ?? Number(barber.commissionValue ?? 0)
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    throw new UnprocessableError('Commission value must be a non-negative number.')
  }
  if (nextType === 'PERCENTAGE' && nextValue > 100) {
    throw new UnprocessableError('Percentage commission must be between 0 and 100.')
  }
  await barber.update({ commissionType: nextType, commissionValue: nextValue })
  await CommissionRateHistory.create({
    barberId,
    commissionType: nextType,
    commissionValue: nextValue,
    effectiveFrom: input.effectiveFrom ?? new Date(),
    changedByAdminId,
  })
  return serializeRateRow(barber)
}
