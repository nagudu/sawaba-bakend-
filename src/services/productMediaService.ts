import type { Prisma } from '@prisma/client'
import { UnprocessableError } from '../utils/errors'
import {
  MAX_PRODUCT_VIDEO_DURATION_SECONDS,
  deleteImageByUrl,
  deleteVideoByUrl,
} from '../utils/upload'

/** Shared product-media reconciliation used by both the vendor and admin APIs. */

export type MediaType = 'IMAGE' | 'VIDEO'

export interface ExistingMediaSelection {
  id: number
  isPrimary?: boolean
}

export interface NewMedia {
  url: string
  mediaType: MediaType
  publicId?: string | null
  thumbnailUrl?: string | null
  duration?: number | null
}

export interface ReconcileMediaInput {
  productName: string
  /** Final ordered list of existing media to keep. Omit to keep them all. */
  existingMedia?: ExistingMediaSelection[]
  uploadedImages?: NewMedia[]
  uploadedVideos?: NewMedia[]
  /** URL to force as primary (e.g. a newly uploaded video). */
  primaryUrl?: string | null
}

export interface RemovedMedia {
  url: string
  mediaType: MediaType
}

const MAX_IMAGES = 8
const MAX_VIDEOS = 4
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i
const VIDEO_EXT = /\.(mp4|webm)(\?.*)?$/i

function isAllowedMediaUrl(url: string): boolean {
  return /^https:\/\/res\.cloudinary\.com\//i.test(url) || url.startsWith('/uploads/')
}

function isVideo(mediaType: string): boolean {
  return mediaType === 'VIDEO'
}

export async function reconcileProductMedia(
  tx: Prisma.TransactionClient,
  productId: number,
  input: ReconcileMediaInput,
): Promise<{ removed: RemovedMedia[] }> {
  const existing = await tx.productImage.findMany({ where: { productId } })
  const byId = new Map(existing.map((row) => [row.id, row]))

  const selection = input.existingMedia
  if (selection) {
    for (const item of selection) {
      if (!byId.has(item.id)) {
        throw new UnprocessableError('One of the selected media items no longer exists.')
      }
    }
  }

  const keepIds = new Set(selection ? selection.map((item) => item.id) : existing.map((row) => row.id))
  const removedRows = existing.filter((row) => !keepIds.has(row.id))
  if (removedRows.length > 0) {
    await tx.productImage.deleteMany({ where: { id: { in: removedRows.map((row) => row.id) } } })
  }
  const removed: RemovedMedia[] = removedRows.map((row) => ({
    url: row.url,
    mediaType: isVideo(row.mediaType) ? 'VIDEO' : 'IMAGE',
  }))

  const uploadedImages = (input.uploadedImages ?? []).map((media) => ({ ...media, mediaType: 'IMAGE' as const }))
  const uploadedVideos = (input.uploadedVideos ?? []).map((media) => ({ ...media, mediaType: 'VIDEO' as const }))

  for (const media of [...uploadedImages, ...uploadedVideos]) {
    if (!isAllowedMediaUrl(media.url)) {
      throw new UnprocessableError('Product media must be hosted on SAWABA storage.')
    }
    if (isVideo(media.mediaType)) {
      if (!VIDEO_EXT.test(media.url)) {
        throw new UnprocessableError('Product videos must be MP4 or WebM.')
      }
      if (
        media.duration != null &&
        (media.duration <= 0 || media.duration > MAX_PRODUCT_VIDEO_DURATION_SECONDS)
      ) {
        throw new UnprocessableError(
          `Product videos must be ${MAX_PRODUCT_VIDEO_DURATION_SECONDS} seconds or shorter.`,
        )
      }
    } else if (!/res\.cloudinary\.com/i.test(media.url) && !IMAGE_EXT.test(media.url)) {
      throw new UnprocessableError('Unsupported image format.')
    }
  }

  const keptRows = selection
    ? selection.map((item) => byId.get(item.id)!).filter(Boolean)
    : existing
        .filter((row) => keepIds.has(row.id))
        .sort((a, b) => a.sortOrder - b.sortOrder)

  const keptImages = keptRows.filter((row) => !isVideo(row.mediaType)).length
  const keptVideos = keptRows.filter((row) => isVideo(row.mediaType)).length
  if (keptImages + uploadedImages.length > MAX_IMAGES) {
    throw new UnprocessableError(`A maximum of ${MAX_IMAGES} product images is allowed.`)
  }
  if (keptVideos + uploadedVideos.length > MAX_VIDEOS) {
    throw new UnprocessableError(`A maximum of ${MAX_VIDEOS} product videos is allowed.`)
  }
  if (keptRows.length + uploadedImages.length + uploadedVideos.length === 0) {
    throw new UnprocessableError('Add at least one product image or video.')
  }

  // Persist the selected order for existing rows.
  for (let index = 0; index < keptRows.length; index += 1) {
    const row = keptRows[index]
    if (row.sortOrder !== index) {
      await tx.productImage.update({ where: { id: row.id }, data: { sortOrder: index } })
    }
  }

  // Append new media after the kept rows.
  let nextOrder = keptRows.length
  for (const media of [...uploadedImages, ...uploadedVideos]) {
    await tx.productImage.create({
      data: {
        productId,
        url: media.url,
        mediaType: media.mediaType,
        publicId: media.publicId ?? null,
        thumbnailUrl: media.thumbnailUrl ?? null,
        duration: media.duration ?? null,
        sortOrder: nextOrder,
        alt: `${input.productName} ${media.mediaType === 'VIDEO' ? 'video' : 'image'} ${nextOrder + 1}`,
      },
    })
    nextOrder += 1
  }

  // Exactly one primary.
  const finalRows = await tx.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: 'asc' },
  })
  let primaryUrl = input.primaryUrl?.trim() || null
  if (!primaryUrl && selection) {
    const flagged = selection.find((item) => item.isPrimary)
    if (flagged) primaryUrl = byId.get(flagged.id)?.url ?? null
  }
  if (!primaryUrl) {
    const existingPrimary = finalRows.find((row) => row.isPrimary)
    primaryUrl = existingPrimary?.url ?? finalRows[0]?.url ?? null
  }
  const primary = finalRows.find((row) => row.url === primaryUrl) ?? finalRows[0]
  if (primary) {
    await tx.productImage.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } })
    await tx.productImage.update({ where: { id: primary.id }, data: { isPrimary: true } })
  }

  return { removed }
}

/** Deletes stored assets for removed/replaced media (call after the DB transaction). */
export async function deleteRemovedMedia(removed: RemovedMedia[]): Promise<void> {
  for (const media of removed) {
    try {
      if (media.mediaType === 'VIDEO') await deleteVideoByUrl(media.url)
      else await deleteImageByUrl(media.url)
    } catch (error) {
      console.error('[product-media] failed to delete asset:', media.url, (error as Error).message)
    }
  }
}
