import { prisma } from '../config/database'
import type { GalleryCategory, GalleryMediaType, Prisma } from '@prisma/client'
import { AppError, NotFoundError } from '../utils/errors'
import { getPagination } from '../utils/response'
import { deleteImageByUrl, deleteVideoByUrl } from '../utils/upload'
import type { CreateGalleryInput, UpdateGalleryInput } from '../validators/gallery'
import type { Paged } from '../types'

export interface GalleryPublic {
  id: number
  title: string
  image: string | null
  video: string | null
  mediaType: string
  duration: number | null
  category: string
  barberId: number | null
  createdAt: Date | null
  updatedAt: Date | null
  barber?: { id: number; name: string } | null
}

/** Server-managed extras that are not part of the client-facing validator. */
export type GalleryMediaInput = {
  videoPublicId?: string | null
}

const withBarber = {
  barber: { select: { id: true, name: true } },
} satisfies Prisma.GalleryInclude

type GalleryRow = Prisma.GalleryGetPayload<{ include: typeof withBarber }>

function serializeGallery(image: GalleryRow): GalleryPublic {
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
  }
}

export async function createGallery(
  input: CreateGalleryInput,
  media: GalleryMediaInput = {},
): Promise<GalleryPublic> {
  if (input.barberId) {
    const barber = await prisma.barber.findUnique({
      where: { id: input.barberId },
      select: { id: true },
    })
    if (!barber) {
      throw new NotFoundError('Linked barber does not exist.')
    }
  }

  const mediaType: GalleryMediaType = input.mediaType ?? (input.video ? 'VIDEO' : 'IMAGE')

  if (mediaType === 'VIDEO') {
    if (!input.video) {
      throw new AppError('A video file or URL is required for a video gallery item.', 400)
    }
  } else if (!input.image) {
    throw new AppError('An image is required. Upload a file or provide an image URL.', 400)
  }

  const created = await prisma.gallery.create({
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
  })
  return getGalleryById(created.id)
}

export async function listGallery(query: {
  category?: string
  mediaType?: string
  barberId?: number
  page?: number
  perPage?: number
}): Promise<Paged<GalleryPublic>> {
  const { page, perPage, offset, limit } = getPagination(query)
  const where: Prisma.GalleryWhereInput = {
    ...(query.category ? { category: query.category as GalleryCategory } : {}),
    ...(query.mediaType ? { mediaType: query.mediaType as GalleryMediaType } : {}),
    ...(query.barberId ? { barberId: query.barberId } : {}),
  }

  const [rows, total] = await prisma.$transaction([
    prisma.gallery.findMany({
      where,
      include: withBarber,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.gallery.count({ where }),
  ])

  return { items: rows.map(serializeGallery), total, page, perPage }
}

export async function getGalleryById(id: number): Promise<GalleryPublic> {
  const image = await prisma.gallery.findUnique({ where: { id }, include: withBarber })
  if (!image) {
    throw new NotFoundError('Gallery item not found.')
  }
  return serializeGallery(image)
}

export async function updateGalleryItem(
  id: number,
  input: UpdateGalleryInput,
  media: GalleryMediaInput = {},
): Promise<GalleryPublic> {
  const image = await prisma.gallery.findUnique({ where: { id }, select: { id: true } })
  if (!image) {
    throw new NotFoundError('Gallery item not found.')
  }

  if (input.barberId) {
    const barber = await prisma.barber.findUnique({
      where: { id: input.barberId },
      select: { id: true },
    })
    if (!barber) {
      throw new NotFoundError('Linked barber does not exist.')
    }
  }

  await prisma.gallery.update({
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
  })
  return getGalleryById(id)
}

export async function deleteGalleryItem(id: number): Promise<void> {
  const item = await prisma.gallery.findUnique({
    where: { id },
    select: { image: true, video: true },
  })
  if (!item) {
    throw new NotFoundError('Gallery item not found.')
  }

  await Promise.all([
    deleteImageByUrl(item.image ?? '').catch(() => undefined),
    deleteVideoByUrl(item.video ?? '').catch(() => undefined),
  ])
  await prisma.gallery.delete({ where: { id } })
}
