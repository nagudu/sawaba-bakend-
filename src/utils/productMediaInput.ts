import type { Request } from 'express'
import { UnprocessableError } from './errors'
import { MAX_IMAGE_SIZE_MB, uploadImageToCloudinary, uploadVideoToCloudinary } from './upload'
import type { ExistingMediaSelection, NewMedia } from '../services/productMediaService'

/** Helpers shared by the vendor and admin product controllers. */

/** Reads `images` / `videos` from either `.fields()` (object) or legacy `.array()`. */
export function productFiles(req: Request): {
  images: Express.Multer.File[]
  videos: Express.Multer.File[]
} {
  const files = req.files as unknown
  if (Array.isArray(files)) return { images: files as Express.Multer.File[], videos: [] }
  const map = (files ?? {}) as Record<string, Express.Multer.File[]>
  return { images: map.images ?? [], videos: map.videos ?? [] }
}

/** Uploads multipart product media through the existing Cloudinary/local adapters. */
export async function uploadProductFiles(req: Request): Promise<{
  images: NewMedia[]
  videos: NewMedia[]
}> {
  const { images, videos } = productFiles(req)
  if (images.length > 8) throw new UnprocessableError('A maximum of 8 product images is allowed.')
  if (videos.length > 4) throw new UnprocessableError('A maximum of 4 product videos is allowed.')

  const uploadedImages: NewMedia[] = []
  for (const file of images) {
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      throw new UnprocessableError(`Images must be under ${MAX_IMAGE_SIZE_MB}MB.`)
    }
    const uploaded = await uploadImageToCloudinary(file.buffer, 'sawaba-products', file.mimetype)
    uploadedImages.push({ url: uploaded.url, mediaType: 'IMAGE', publicId: uploaded.publicId })
  }

  const uploadedVideos: NewMedia[] = []
  for (const file of videos) {
    const uploaded = await uploadVideoToCloudinary(file.buffer, 'sawaba-products', file.mimetype)
    uploadedVideos.push({
      url: uploaded.url,
      mediaType: 'VIDEO',
      publicId: uploaded.publicId,
      thumbnailUrl: uploaded.thumbnailUrl,
      duration: uploaded.duration,
    })
  }

  return { images: uploadedImages, videos: uploadedVideos }
}

function parseJson(value: unknown, label: string): unknown {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new UnprocessableError(`Invalid ${label}.`)
  }
}

/** Direct-to-Cloudinary media (images and videos) submitted by the browser. */
export function parseDirectMedia(value: unknown): NewMedia[] {
  const parsed = parseJson(value, 'media list')
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      url: String(item.url ?? ''),
      mediaType: item.mediaType === 'VIDEO' ? ('VIDEO' as const) : ('IMAGE' as const),
      publicId: typeof item.publicId === 'string' ? item.publicId : null,
      thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
      duration: typeof item.duration === 'number' ? item.duration : null,
    }))
    .filter((item) => item.url.length > 0)
}

/** Direct-to-Cloudinary videos only (legacy `videosJson` field). */
export function parseDirectVideos(value: unknown): NewMedia[] {
  return parseDirectMedia(value).map((media) => ({ ...media, mediaType: 'VIDEO' as const }))
}

/** Final ordered list of existing media to keep (ids + primary flag). */
export function parseExistingMedia(value: unknown): ExistingMediaSelection[] | undefined {
  const parsed = parseJson(value, 'media list')
  if (!Array.isArray(parsed)) return undefined
  return parsed
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({ id: Number(item.id), isPrimary: Boolean(item.isPrimary) }))
    .filter((item) => Number.isInteger(item.id) && item.id > 0)
}

export function parsePrimaryUrl(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
