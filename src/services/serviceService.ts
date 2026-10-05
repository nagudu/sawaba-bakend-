import { Op } from 'sequelize'
import { Appointment, Service } from '../models'
import { ConflictError, NotFoundError } from '../utils/errors'
import { slugify } from '../utils/slug'
import { getPagination } from '../utils/response'
import type { CreateServiceInput, UpdateServiceInput } from '../validators/service'
import type { Paged } from '../types'

export interface ServicePublic {
  id: number
  name: string
  slug: string
  description: string | null
  price: number
  duration: number
  image: string | null
  category: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export function serializeService(service: Service): ServicePublic {
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
  }
}

async function uniqueSlug(name: string, excludeId?: number): Promise<string> {
  const base = slugify(name)
  let candidate = base
  let counter = 2

  while (true) {
    const existing = await Service.findOne({
      where: excludeId
        ? { slug: candidate, id: { [Op.not]: excludeId } }
        : { slug: candidate },
    })
    if (!existing) return candidate
    candidate = `${base}-${counter}`
    counter += 1
  }
}

export async function createService(input: CreateServiceInput): Promise<ServicePublic> {
  const slug = await uniqueSlug(input.name)
  const service = await Service.create({ ...input, slug })
  return serializeService(service)
}

export async function listServices(
  query: { category?: string; isActive?: string; search?: string; page?: number; perPage?: number },
  includeInactive = false,
): Promise<Paged<ServicePublic>> {
  const { page, perPage, offset, limit } = getPagination(query as Record<string, unknown>)

  const where = {
    ...(query.category ? { category: query.category } : {}),
    ...(!includeInactive
      ? { isActive: true }
      : query.isActive
        ? { isActive: query.isActive === 'true' }
        : {}),
    ...(query.search
      ? {
          [Op.or]: [
            { name: { [Op.like]: `%${query.search}%` } },
            { slug: { [Op.like]: `%${query.search}%` } },
            { description: { [Op.like]: `%${query.search}%` } },
          ],
        }
      : {}),
  }

  const { rows, count } = await Service.findAndCountAll({
    where,
    order: [['name', 'ASC']],
    offset,
    limit,
  })

  return {
    items: rows.map(serializeService),
    total: count,
    page,
    perPage,
  }
}

export async function getServiceById(id: number): Promise<ServicePublic> {
  const service = await Service.findByPk(id)
  if (!service) {
    throw new NotFoundError('Service not found.')
  }
  return serializeService(service)
}

export async function updateService(id: number, input: UpdateServiceInput): Promise<ServicePublic> {
  const service = await Service.findByPk(id)
  if (!service) {
    throw new NotFoundError('Service not found.')
  }

  const changes: Partial<Service> = { ...input }
  if (input.name && input.name !== service.name) {
    changes.slug = await uniqueSlug(input.name, id)
  }

  await service.update(changes)
  return serializeService(service)
}

export async function deleteService(id: number): Promise<void> {
  const service = await Service.findByPk(id)
  if (!service) {
    throw new NotFoundError('Service not found.')
  }

  const appointmentCount = await Appointment.count({ where: { serviceId: id } })
  if (appointmentCount > 0) {
    throw new ConflictError(
      'This service has appointments attached. Deactivate it instead of deleting.',
    )
  }

  await service.destroy()
}