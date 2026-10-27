import type { Request, Response, NextFunction } from 'express'
import {
  createGallery,
  listGallery,
  getGalleryById,
  updateGalleryItem,
  deleteGalleryItem,
} from '../services/galleryService'
import { successRes } from '../utils/response'
import {
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  deleteImageByUrl,
  deleteVideoByUrl,
  MAX_IMAGE_SIZE_MB,
} from '../utils/upload'
import { AppError } from '../utils/errors'
import type { CreateGalleryInput, UpdateGalleryInput } from '../validators/gallery'

type UploadedFiles = Request['files']
type MediaType = 'IMAGE' | 'VIDEO'

/** Pulls the first uploaded file for a given multipart field, if any. */
function firstUploadedFile(files: UploadedFiles, field: string): Express.Multer.File | null {
  if (!files || Array.isArray(files)) return null
  const bucket = (files as Record<string, Express.Multer.File[]>)[field]
  return bucket && bucket.length > 0 ? bucket[0] : null
}

/** Multer's request-wide limit is the (larger) video ceiling, so re-check the poster. */
function assertImageWithinLimit(file: Express.Multer.File | null): void {
  if (file && file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    throw new AppError(`Image is too large. Maximum allowed size is ${MAX_IMAGE_SIZE_MB}MB.`, 400)
  }
}

function bodyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export async function createGalleryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const imageFile = firstUploadedFile(req.files, 'image')
    const videoFile = firstUploadedFile(req.files, 'video')
    assertImageWithinLimit(imageFile)

    const uploadedVideo = videoFile
      ? await uploadVideoToCloudinary(videoFile.buffer, 'sawaba-gallery/videos', videoFile.mimetype)
      : null
    const uploadedImage = imageFile
      ? await uploadImageToCloudinary(imageFile.buffer, 'sawaba-gallery', imageFile.mimetype)
      : null

    const bodyImage = bodyString(req.body.image)
    const bodyVideo = bodyString(req.body.video)

    const mediaType: MediaType =
      (req.body.mediaType as MediaType | undefined) ??
      (uploadedVideo || bodyVideo ? 'VIDEO' : 'IMAGE')

    const image =
      bodyImage ??
      uploadedImage?.url ??
      (mediaType === 'VIDEO' ? uploadedVideo?.thumbnailUrl ?? null : null)

    const video = bodyVideo ?? uploadedVideo?.url ?? null

    const input: CreateGalleryInput = {
      title: req.body.title,
      category: req.body.category,
      mediaType,
      barberId: req.body.barberId ? Number(req.body.barberId) : null,
      image,
      video,
      duration: req.body.duration,
    }

    const item = await createGallery(input, { videoPublicId: uploadedVideo?.publicId ?? null })
    successRes(res, 'Gallery item created successfully.', item, 201)
  } catch (error) {
    next(error)
  }
}

export async function listGalleryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as Record<string, unknown>
    const result = await listGallery(query)
    successRes(res, 'Gallery retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function getGalleryByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await getGalleryById(Number(req.params.id))
    successRes(res, 'Gallery item retrieved.', item, 200)
  } catch (error) {
    next(error)
  }
}

export async function updateGalleryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id)
    const existing = await getGalleryById(id)

    const imageFile = firstUploadedFile(req.files, 'image')
    const videoFile = firstUploadedFile(req.files, 'video')
    assertImageWithinLimit(imageFile)

    const uploadedVideo = videoFile
      ? await uploadVideoToCloudinary(videoFile.buffer, 'sawaba-gallery/videos', videoFile.mimetype)
      : null
    const uploadedImage = imageFile
      ? await uploadImageToCloudinary(imageFile.buffer, 'sawaba-gallery', imageFile.mimetype)
      : null

    const bodyImage = bodyString(req.body.image)
    const bodyVideo = bodyString(req.body.video)

    const mediaType: MediaType | undefined =
      (req.body.mediaType as MediaType | undefined) ??
      (uploadedVideo || bodyVideo ? 'VIDEO' : uploadedImage || bodyImage ? 'IMAGE' : undefined)

    const image =
      bodyImage ??
      uploadedImage?.url ??
      (mediaType === 'VIDEO' ? uploadedVideo?.thumbnailUrl ?? undefined : undefined)
    const video = bodyVideo ?? uploadedVideo?.url ?? undefined

    const input: UpdateGalleryInput = {
      ...(req.body.title !== undefined ? { title: req.body.title } : {}),
      ...(req.body.category !== undefined ? { category: req.body.category } : {}),
      ...(mediaType !== undefined ? { mediaType } : {}),
      ...(req.body.barberId !== undefined
        ? { barberId: req.body.barberId === '' || req.body.barberId === null ? null : Number(req.body.barberId) }
        : {}),
      ...(image !== undefined ? { image } : {}),
      ...(video !== undefined ? { video } : {}),
      ...(req.body.duration !== undefined ? { duration: req.body.duration } : {}),
    }

    const item = await updateGalleryItem(id, input, {
      ...(uploadedVideo ? { videoPublicId: uploadedVideo.publicId } : {}),
    })

    if ((uploadedImage || bodyImage) && existing.image && existing.image !== item.image) {
      await deleteImageByUrl(existing.image).catch(() => undefined)
    }
    if ((uploadedVideo || bodyVideo) && existing.video && existing.video !== item.video) {
      await deleteVideoByUrl(existing.video).catch(() => undefined)
    }

    successRes(res, 'Gallery item updated successfully.', item, 200)
  } catch (error) {
    next(error)
  }
}

export async function deleteGalleryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteGalleryItem(Number(req.params.id))
    successRes(res, 'Gallery item deleted successfully.', {}, 200)
  } catch (error) {
    next(error)
  }
}