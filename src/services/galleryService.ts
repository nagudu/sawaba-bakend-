import { Gallery, Barber } from '../models'
import { AppError, NotFoundError } from '../utils/errors'
import { getPagination } from '../utils/response'
import { deleteImageByUrl } from '../utils/upload'
import type { CreateGalleryInput, UpdateGalleryInput } from '../validators/gallery'
import type { Paged } from '../types'

export interface GalleryPublic {
  id: number
  title: string
  image: string
  category: string
  barberId: number | null
  createdAt: Date
  updatedAt: Date
  barber?: { id: number; name: string } | null
}

function serializeGallery(image: Gallery): GalleryPublic {
  return {
    id: image.id,
    title: image.title,
    image: image.image,
    category: image.category,
    barberId: image.barberId ?? null,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    barber: image.barber ? { id: image.barber.id, name: image.barber.name } : null,
  }
}

export async function createGallery(input: CreateGalleryInput): Promise<GalleryPublic> {
  if (input.barberId) {
    const barber = await Barber.findByPk(input.barberId)
    if (!barber) {
      throw new NotFoundError('Linked barber does not exist.')
    }
  }

  if (!input.image) {
    throw new AppError('An image is required. Upload a file or provide an image URL.', 400)
  }

  const image = await Gallery.create({
    title: input.title,
    category: input.category,
    barberId: input.barberId ?? null,
    image: input.image,
  })
  return getGalleryById(image.id)
}

export async function listGallery(query: {
  category?: string
  barberId?: number
  page?: number
  perPage?: number
}): Promise<Paged<GalleryPublic>> {
  const { page, perPage, offset, limit } = getPagination(query)

  const where: Record<string, unknown> = {}
  if (query.category) where.category = query.category
  if (query.barberId) where.barberId = query.barberId

  const { rows, count } = await Gallery.findAndCountAll({
    where,
    include: [{ model: Barber, as: 'barber', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
    offset,
    limit,
  })

  return { items: rows.map(serializeGallery), total: count, page, perPage }
}

export async function getGalleryById(id: number): Promise<GalleryPublic> {
  const image = await Gallery.findByPk(id, {
    include: [{ model: Barber, as: 'barber', attributes: ['id', 'name'] }],
  })
  if (!image) {
    throw new NotFoundError('Gallery item not found.')
  }
  return serializeGallery(image)
}

export async function updateGalleryItem(
  id: number,
  input: UpdateGalleryInput,
): Promise<GalleryPublic> {
  const image = await Gallery.findByPk(id)
  if (!image) {
    throw new NotFoundError('Gallery item not found.')
  }

  if (input.barberId) {
    const barber = await Barber.findByPk(input.barberId)
    if (!barber) {
      throw new NotFoundError('Linked barber does not exist.')
    }
  }

  const changes: Partial<Gallery> = {}
  if (input.title !== undefined) changes.title = input.title
  if (input.category !== undefined) changes.category = input.category
  if (input.barberId !== undefined) changes.barberId = input.barberId
  if (input.image !== undefined && input.image !== null) {
    changes.image = input.image
  }

  await image.update(changes)
  return getGalleryById(id)
}

export async function deleteGalleryItem(id: number): Promise<void> {
  const image = await Gallery.findByPk(id)
  if (!image) {
    throw new NotFoundError('Gallery item not found.')
  }

  await deleteImageByUrl(image.image).catch(() => undefined)

  await image.destroy()
}