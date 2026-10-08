import type { UploadApiResponse } from 'cloudinary'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { cloudinary } from '../config/cloudinary'
import { env } from '../config/env'
import { AppError } from './errors'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
// Vercel serverless request body ceiling is 4.5MB; capping upload file size at 4MB prevents 413 Gateway errors
export const MAX_IMAGE_SIZE_MB = 4

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

const PLACEHOLDER_VALUES = new Set([
  'your-cloud-name',
  'your-api-key',
  'your-api-secret',
  'your_cloud_name',
  'your_api_key',
  'your_api_secret',
])

export function credentialsConfigured(): boolean {
  if (
    process.env.CLOUDINARY_URL &&
    process.env.CLOUDINARY_URL.startsWith('cloudinary://') &&
    !process.env.CLOUDINARY_URL.includes('your-api-key') &&
    !process.env.CLOUDINARY_URL.includes('your_api_key')
  ) {
    return true
  }
  return (
    Boolean(env.cloudinary.cloudName) &&
    Boolean(env.cloudinary.apiKey) &&
    Boolean(env.cloudinary.apiSecret) &&
    !PLACEHOLDER_VALUES.has(env.cloudinary.cloudName) &&
    !PLACEHOLDER_VALUES.has(env.cloudinary.apiKey) &&
    !PLACEHOLDER_VALUES.has(env.cloudinary.apiSecret)
  )
}

/** Detects if the code is executing within a Vercel Serverless environment. */
export function isVercelRuntime(): boolean {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV)
}

/**
 * Determines whether to upload to Cloudinary or write to local disk.
 * - If UPLOAD_DRIVER is explicitly set ('cloudinary' or 'local'), respect it.
 * - On Vercel, the filesystem is ephemeral and read-only, so Cloudinary is required.
 * - If Cloudinary credentials are configured, prefer Cloudinary.
 * - Otherwise falls back to local disk (offline-first development).
 */
export function getUploadDriver(): 'cloudinary' | 'local' {
  const explicit = process.env.UPLOAD_DRIVER?.trim().toLowerCase()
  if (explicit === 'cloudinary' || explicit === 'local') {
    return explicit
  }

  if (isVercelRuntime()) {
    return 'cloudinary'
  }

  if (credentialsConfigured()) {
    return 'cloudinary'
  }

  return 'local'
}

// ─── Local disk storage (offline-first default) ───────────────────────────────
// UPLOAD_DRIVER=local writes images into backend/uploads/<folder>/
// and stores web paths like /uploads/<folder>/<file> in the database. The
// backend serves /uploads statically, so everything works with no internet
// and no third-party account. On Vercel (or when Cloudinary is configured),
// Cloudinary is automatically selected.

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
  if (isVercelRuntime()) {
    throw new AppError(
      'Local file uploads cannot be persisted on Vercel Serverless. Please configure Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET, or CLOUDINARY_URL) in your Vercel Project Settings > Environment Variables.',
      503,
    )
  }
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

/** Deletes a stored image when it is a local upload; Cloudinary images use Cloudinary destroy. */
export async function deleteImageFromCloudinary(publicId: string): Promise<void> {
  if (!publicId) return
  if (publicId.startsWith('local:')) {
    deleteLocalImage(publicId)
    return
  }
  if (credentialsConfigured()) {
    await cloudinary.uploader.destroy(publicId).catch(() => undefined)
  }
}

/**
 * Extracts the full Cloudinary public_id from a Cloudinary URL, including folder paths
 * and stripping any transformation segments (e.g. /image/upload/v1234/folder/photo.jpg -> folder/photo).
 */
export function extractCloudinaryPublicId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const marker = '/image/upload/'
    const idx = parsed.pathname.indexOf(marker)
    if (idx === -1) return null

    const sub = parsed.pathname.slice(idx + marker.length)
    const parts = sub.split('/')

    let startIdx = 0
    while (startIdx < parts.length) {
      const part = parts[startIdx]
      if (/^v\d+$/.test(part)) {
        startIdx++
        break
      }
      if (part.includes(',') || /^[a-z]_[a-z0-9_-]+$/i.test(part)) {
        startIdx++
        continue
      }
      break
    }

    const publicPathWithExt = parts.slice(startIdx).join('/')
    if (!publicPathWithExt) return null

    const dotIdx = publicPathWithExt.lastIndexOf('.')
    return dotIdx !== -1 ? publicPathWithExt.slice(0, dotIdx) : publicPathWithExt
  } catch {
    return null
  }
}

/** Deletes an image given only its stored URL — works for /uploads paths and Cloudinary URLs. */
export async function deleteImageByUrl(url: string): Promise<void> {
  if (!url) return
  if (isLocalUploadUrl(url)) {
    const target = localUploadPath(url)
    if (target && target.startsWith(uploadsRoot) && fs.existsSync(target)) {
      fs.unlinkSync(target)
    }
    return
  }
  if (url.includes('cloudinary') && credentialsConfigured()) {
    const publicId = extractCloudinaryPublicId(url)
    if (publicId) {
      await cloudinary.uploader.destroy(publicId).catch(() => undefined)
    }
  }
}

export async function uploadImageToCloudinary(
  buffer: Buffer,
  folder?: string,
  mimetype: string = 'image/jpeg',
): Promise<UploadedImage> {
  const driver = getUploadDriver()

  if (driver === 'cloudinary') {
    if (!credentialsConfigured()) {
      const isVercel = isVercelRuntime()
      const errorMsg = isVercel
        ? 'Image upload is not configured. Since this backend runs on Vercel Serverless, persistent image storage requires Cloudinary. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET (or CLOUDINARY_URL) to your Vercel Project Settings > Environment Variables.'
        : 'Image upload is not configured. Add your real Cloudinary credentials to backend/.env (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET, or CLOUDINARY_URL), or set UPLOAD_DRIVER=local for offline local storage.'
      throw new AppError(errorMsg, 503)
    }

    const id = crypto.randomBytes(12).toString('hex')
    const targetFolder = folder ?? env.cloudinary.uploadFolder
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: targetFolder,
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
