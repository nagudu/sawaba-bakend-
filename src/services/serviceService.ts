import { prisma } from '../config/database'
import type { Prisma, Service as ServiceModel } from '@prisma/client'
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
  createdAt: Date | null
  updatedAt: Date | null
}

export function serializeService(service: ServiceModel): ServicePublic {
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
  }
}

async function uniqueSlug(name: string, excludeId?: number): Promise<string> {
  const base = slugify(name)
  let candidate = base
  let counter = 2

  for (;;) {
    const existing = await prisma.service.findFirst({
      where: excludeId ? { slug: candidate, id: { not: excludeId } } : { slug: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
    candidate = `${base}-${counter}`
    counter += 1
  }
}

export async function createService(input: CreateServiceInput): Promise<ServicePublic> {
  const slug = await uniqueSlug(input.name)
  const service = await prisma.service.create({ data: { ...input, slug } })
  return serializeService(service)
}

export async function listServices(
  query: { category?: string; isActive?: string; search?: string; page?: number; perPage?: number },
  includeInactive = false,
): Promise<Paged<ServicePublic>> {
  const { page, perPage, offset, limit } = getPagination(query as Record<string, unknown>)
  const where: Prisma.ServiceWhereInput = {
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
  }

  const [rows, total] = await prisma.$transaction([
    prisma.service.findMany({ where, orderBy: { name: 'asc' }, skip: offset, take: limit }),
    prisma.service.count({ where }),
  ])

  return { items: rows.map(serializeService), total, page, perPage }
}

export async function getServiceById(id: number): Promise<ServicePublic> {
  const service = await prisma.service.findUnique({ where: { id } })
  if (!service) {
    throw new NotFoundError('Service not found.')
  }
  return serializeService(service)
}

export async function updateService(id: number, input: UpdateServiceInput): Promise<ServicePublic> {
  const service = await prisma.service.findUnique({ where: { id } })
  if (!service) {
    throw new NotFoundError('Service not found.')
  }

  const slug = input.name && input.name !== service.name ? await uniqueSlug(input.name, id) : undefined
  const updated = await prisma.service.update({
    where: { id },
    data: {
      ...input,
      ...(slug ? { slug } : {}),
    },
  })
  return serializeService(updated)
}

export async function deleteService(id: number): Promise<void> {
  const service = await prisma.service.findUnique({ where: { id }, select: { id: true } })
  if (!service) {
    throw new NotFoundError('Service not found.')
  }

  const appointmentCount = await prisma.appointment.count({ where: { serviceId: id } })
  if (appointmentCount > 0) {
    throw new ConflictError(
      'This service has appointments attached. Deactivate it instead of deleting.',
    )
  }

  await prisma.service.delete({ where: { id } })
}
