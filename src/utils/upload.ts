import type { UploadApiResponse } from 'cloudinary'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { cloudinary } from '../config/cloudinary'
import { env } from '../config/env'
import { AppError } from './errors'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
export const MAX_IMAGE_SIZE_MB = 5

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new AppError('Only JPEG, PNG, WEBP, GIF and AVIF images are allowed.', 400))
    }
    cb(null, true)
  },
})

export interface UploadedImage {
  url: string
  publicId: string
}

const PLACEHOLDER_VALUES = new Set(['your-cloud-name', 'your-api-key', 'your-api-secret'])

function credentialsConfigured(): boolean {
  return (
    Boolean(env.cloudinary.cloudName) &&
    Boolean(env.cloudinary.apiKey) &&
    Boolean(env.cloudinary.apiSecret) &&
    !PLACEHOLDER_VALUES.has(env.cloudinary.cloudName) &&
    !PLACEHOLDER_VALUES.has(env.cloudinary.apiKey) &&
    !PLACEHOLDER_VALUES.has(env.cloudinary.apiSecret)
  )
}

// ─── Local disk storage (offline-first default) ───────────────────────────────
// UPLOAD_DRIVER=local (default) writes images into backend/uploads/<folder>/
// and stores web paths like /uploads/<folder>/<file> in the database. The
// backend serves /uploads statically, so everything works with no internet
// and no third-party account. UPLOAD_DRIVER=cloudinary keeps the legacy
// behavior for cloud deployments.

// CommonJS build: resolve from this compiled file (dist/utils/upload.js → backend/uploads)
export const uploadsRoot = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../../uploads')

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export const isLocalUploadUrl = (url: string): boolean => url.startsWith('/uploads/')

/** Absolute filesystem path for a stored local upload URL (null for external URLs). */
export function localUploadPath(url: string): string | null {
  if (!isLocalUploadUrl(url)) return null
  const rel = path.normalize(url.replace('/uploads/', '')).replace(/^(\.\.[/\\])+/, '')
  return path.join(uploadsRoot, rel)
}

function saveLocalImage(buffer: Buffer, folder: string, mimetype: string): UploadedImage {
  const sub = path.basename(folder || 'misc')
  const dir = path.join(uploadsRoot, sub)
  fs.mkdirSync(dir, { recursive: true })
  const ext = EXTENSIONS[mimetype] ?? 'jpg'
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(dir, name), buffer)
  return { url: `/uploads/${sub}/${name}`, publicId: `local:${sub}/${name}` }
}

function deleteLocalImage(publicId: string): void {
  // publicId format: "local:<subdir>/<filename>"
  if (!publicId.startsWith('local:')) return
  const rel = path.normalize(publicId.slice('local:'.length)).replace(/^(\.\.[/\\])+/, '')
  const target = path.join(uploadsRoot, rel)
  if (target.startsWith(uploadsRoot) && fs.existsSync(target)) {
    fs.unlinkSync(target)
  }
}

/** Deletes a stored image when it is a local upload; Cloudinary images keep their legacy cleanup. */
export async function deleteImageFromCloudinary(publicId: string): Promise<void> {
  if (!publicId) return
  if (publicId.startsWith('local:')) {
    deleteLocalImage(publicId)
    return
  }
  await cloudinary.uploader.destroy(publicId).catch(() => undefined)
}

/** Deletes an image given only its stored URL — works for /uploads paths and cloud URLs. */
export async function deleteImageByUrl(url: string): Promise<void> {
  if (!url) return
  if (isLocalUploadUrl(url)) {
    const target = localUploadPath(url)
    if (target && target.startsWith(uploadsRoot) && fs.existsSync(target)) {
      fs.unlinkSync(target)
    }
    return
  }
  if (url.includes('cloudinary')) {
    // Legacy cloud URLs: derive the public id from the path.
    try {
      const parsed = new URL(url)
      const file = parsed.pathname.split('/').pop() ?? ''
      const id = file.split('.')[0]
      if (id) await cloudinary.uploader.destroy(id).catch(() => undefined)
    } catch {
      // ignore malformed URLs
    }
  }
}

export async function uploadImageToCloudinary(
  buffer: Buffer,
  folder?: string,
  mimetype: string = 'image/jpeg',
): Promise<UploadedImage> {
  const driver = (process.env.UPLOAD_DRIVER ?? 'local').toLowerCase()

  if (driver === 'cloudinary') {
    if (!credentialsConfigured()) {
      throw new AppError(
        'Image upload is not configured. Add your real Cloudinary API key and secret to backend/.env, or paste an image URL instead of uploading a file.',
        503,
      )
    }
    const id = crypto.randomBytes(12).toString('hex')
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: folder ?? env.cloudinary.uploadFolder,
          public_id: id,
          resource_type: 'image',
          transformation: [{ width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
        },
        (error, uploadResult) => {
          if (error) reject(error)
          else if (uploadResult) resolve(uploadResult)
          else reject(new Error('Cloudinary returned no result'))
        },
      )
      stream.end(buffer)
    })
    return { url: result.secure_url, publicId: result.public_id }
  }

  // Default: local disk — works fully offline.
  return saveLocalImage(buffer, folder ?? 'misc', mimetype)
}
