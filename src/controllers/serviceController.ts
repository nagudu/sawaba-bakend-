import type { Request, Response, NextFunction } from 'express'
import {
  createService,
  listServices,
  getServiceById,
  updateService,
  deleteService,
} from '../services/serviceService'
import { successRes } from '../utils/response'
import { uploadImageToCloudinary, deleteImageByUrl } from '../utils/upload'
import type { CreateServiceInput, UpdateServiceInput } from '../validators/service'

export async function createServiceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const uploadedImage = req.file ? await uploadImageToCloudinary(req.file.buffer, 'sawaba-services', req.file.mimetype) : null
    const input: CreateServiceInput = {
      ...req.body,
      image: req.body.image ?? uploadedImage?.url ?? null,
    }
    const service = await createService(input)
    successRes(res, 'Service created successfully.', service, 201)
  } catch (error) {
    next(error)
  }
}

export async function listServicesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as Record<string, unknown>
    const result = await listServices(query)
    successRes(res, 'Services retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function getServiceByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id)
    const service = await getServiceById(id)
    successRes(res, 'Service retrieved.', service, 200)
  } catch (error) {
    next(error)
  }
}

export async function updateServiceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id)
    const uploadedImage = req.file ? await uploadImageToCloudinary(req.file.buffer, 'sawaba-services', req.file.mimetype) : null
    const existing = await getServiceById(id)

    const input: UpdateServiceInput = {
      ...req.body,
      image: req.body.image ?? uploadedImage?.url ?? existing.image,
    }
    const service = await updateService(id, input)

    // Clean up the replaced upload (only when the image actually changed).
    if (uploadedImage && existing.image && existing.image !== service.image) {
      await deleteImageByUrl(existing.image).catch(() => undefined)
    }
    successRes(res, 'Service updated successfully.', service, 200)
  } catch (error) {
    next(error)
  }
}

export async function deleteServiceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id)
    await deleteService(id)
    successRes(res, 'Service deleted successfully.', {}, 200)
  } catch (error) {
    next(error)
  }
}