import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { UniqueConstraintError, ForeignKeyConstraintError } from 'sequelize'
import { AppError } from '../utils/errors'

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  })
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ success: false, message: error.message })
    return
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0]
    const message = firstIssue
      ? `${firstIssue.path.join('.') || 'Request'}: ${firstIssue.message}`
      : 'Validation failed.'
    res.status(422).json({ success: false, message })
    return
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum allowed size is 5MB.'
        : `Upload error: ${error.code}`
    res.status(400).json({ success: false, message })
    return
  }

  if (error instanceof UniqueConstraintError) {
    const field = error.errors[0]?.path
    res.status(409).json({
      success: false,
      message: `A record with the same ${field ?? 'value'} already exists.`,
    })
    return
  }

  if (error instanceof ForeignKeyConstraintError) {
    res.status(400).json({
      success: false,
      message: 'No link could be made with the provided record: related record not found.',
    })
    return
  }

  const parseError = error as { type?: string; status?: number }
  if (parseError.type === 'entity.parse.failed' || parseError.status === 400) {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body.',
    })
    return
  }

  const httpCode = (error as { http_code?: unknown }).http_code
  if (typeof httpCode === 'number' && httpCode >= 400 && httpCode <= 599) {
    res.status(502).json({
      success: false,
      message:
        'Image upload failed. Check your Cloudinary credentials (CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET) in backend/.env.',
    })
    return
  }

  // eslint-disable-next-line no-console
  console.error('[error]', error)

  res.status(500).json({
    success: false,
    message: 'Internal server error.',
  })
}