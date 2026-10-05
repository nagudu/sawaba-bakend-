import type { Request, Response, NextFunction } from 'express'
import {
  createGallery,
  listGallery,
  getGalleryById,
  updateGalleryItem,
  deleteGalleryItem,
} from '../services/galleryService'
import { successRes } from '../utils/response'
import { uploadImageToCloudinary } from '../utils/upload'
import { AppError } from '../utils/errors'
import type { CreateGalleryInput, UpdateGalleryInput } from '../validators/gallery'

export async function createGalleryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const uploadedImage = req.file ? await uploadImageToCloudinary(req.file.buffer, 'sawaba-gallery', req.file.mimetype) : null

    const input: CreateGalleryInput = {
      ...req.body,
      image: req.body.image ?? uploadedImage?.url ?? null,
      barberId: req.body.barberId ? Number(req.body.barberId) : null,
    }

    if (!input.image) {
      throw new AppError('An image is required. Upload a file or provide an image URL.', 400)
    }

    const item = await createGallery(input)
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
    const uploadedImage = req.file ? await uploadImageToCloudinary(req.file.buffer, 'sawaba-gallery', req.file.mimetype) : null

    const input: UpdateGalleryInput = {
      ...req.body,
      image: req.body.image ?? uploadedImage?.url ?? undefined,
      barberId: req.body.barberId === undefined || req.body.barberId === null || req.body.barberId === '' ? null : Number(req.body.barberId),
    }

    const item = await updateGalleryItem(id, input)
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