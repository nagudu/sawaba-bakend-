import fs from 'node:fs'
import path from 'node:path'
import { uploadsRoot } from './upload'

/**
 * Seed/demo images live in the repository (backend/seed-assets) so the app
 * never depends on Unsplash or any online host. This helper copies them into
 * the local uploads directory (stable filenames = idempotent) and returns the
 * web path stored in the database, e.g. /uploads/services/fade.jpg.
 */

// CommonJS build: __dirname = dist/utils (or src/utils under tsx) — assets sit two levels up.
const seedAssetsDir = path.resolve(__dirname, '../../seed-assets')

export function seedAssetPath(filename: string): string {
  return `/uploads/seed/${filename}`
}

export function copySeedAsset(filename: string): string {
  const source = path.join(seedAssetsDir, filename)
  if (!fs.existsSync(source)) {
    console.warn(`[db:seed] missing seed asset: ${filename} (image will 404 until restored)`)
    return seedAssetPath(filename)
  }
  const dir = path.join(uploadsRoot, 'seed')
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, filename)
  if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size) {
    fs.copyFileSync(source, target)
  }
  return seedAssetPath(filename)
}
