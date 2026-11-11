import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../config/database'
import { deleteImageByUrl, deleteVideoByUrl } from '../utils/upload'

/**
 * Applies the supplied media to the application:
 *  - replaces the whole Gallery (images + video),
 *  - re-images services and barbers from the gallery set,
 *  - sets the payment shop logo,
 *  - removes obsolete QA test products and the old official-store images,
 *  - creates the new marketplace products from the supplied product photos,
 *  - preserves real vendor uploads (Brainstorm IT Solution products).
 *
 * Old assets are collected first and deleted only after the DB transaction.
 */

interface Manifest {
  gallery: Array<{ url: string; video?: string; title: string; category: string; mediaType: 'IMAGE' | 'VIDEO'; duration?: number }>
  barbers: string[]
  services: string[]
  paymentLogo: string | null
  products: Array<{ name: string; description: string; price: number; categoryName: string; images: string[] }>
}

const manifest: Manifest = JSON.parse(fs.readFileSync(path.resolve('..', 'promo', 'media-manifest.json'), 'utf8'))

const uploadsRoot = path.resolve('uploads')
const oldLocalFiles = new Set<string>()
const oldCloudinary: Array<{ url: string; type: 'image' | 'video' }> = []

function collectLocal(url: string | null | undefined) {
  if (!url) return
  if (url.startsWith('/uploads/')) {
    const rel = url.replace('/uploads/', '')
    oldLocalFiles.add(path.join(uploadsRoot, rel))
  }
}

function collectCloudinary(url: string | null | undefined, type: 'image' | 'video') {
  if (!url) return
  if (url.includes('res.cloudinary.com')) oldCloudinary.push({ url, type })
}

function slugBase(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180) || 'product'
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugBase(name)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const exists = await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!exists) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

async function main() {
  const galleryRows = await prisma.gallery.findMany()
  const serviceRows = await prisma.service.findMany({ orderBy: { id: 'asc' } })
  const barberRows = await prisma.barber.findMany({ orderBy: { id: 'asc' } })

  const qaProducts = await prisma.product.findMany({
    where: { vendor: { businessName: { startsWith: 'QA ' } } },
    include: { images: true },
  })
  const officialVendor = await prisma.vendor.findFirst({ where: { isOfficial: true }, select: { id: true, businessName: true } })
  if (!officialVendor) throw new Error('Official store vendor not found.')

  const officialProducts = await prisma.product.findMany({
    where: { vendorId: officialVendor.id },
    include: { images: true },
  })
  const oldOfficial = officialProducts.filter((product) => product.status !== 'ARCHIVED' || product.images.length > 0)

  // ── Collect assets that will become obsolete ─────────────────────────────
  for (const row of galleryRows) {
    collectLocal(row.image)
    collectLocal(row.video)
    collectCloudinary(row.video, 'video')
    if (row.image && row.image.includes('res.cloudinary.com')) collectCloudinary(row.image, 'image')
  }
  for (const row of serviceRows) collectLocal(row.image)
  for (const row of barberRows) collectLocal(row.image)
  for (const product of qaProducts) {
    for (const image of product.images) {
      if (image.mediaType === 'VIDEO') {
        collectLocal(image.url)
        collectCloudinary(image.url, 'video')
      } else {
        collectLocal(image.url)
        collectCloudinary(image.url, 'image')
      }
    }
  }
  for (const product of oldOfficial) {
    for (const image of product.images) {
      if (image.mediaType === 'VIDEO') collectCloudinary(image.url, 'video')
      else collectCloudinary(image.url, 'image')
    }
  }

  // ── Database replacement ────────────────────────────────────────────────
  const newProductSlugs: string[] = []
  for (const group of manifest.products) newProductSlugs.push(await uniqueSlug(group.name))

  const result = await prisma.$transaction(async (tx) => {
    // Gallery: full replacement.
    await tx.gallery.deleteMany({})
    const galleryData = manifest.gallery.map((item) =>
      item.mediaType === 'VIDEO'
        ? {
            title: item.title,
            image: item.url,
            video: item.video ?? null,
            mediaType: 'VIDEO' as const,
            duration: item.duration ?? null,
            category: item.category as never,
          }
        : {
            title: item.title,
            image: item.url,
            mediaType: 'IMAGE' as const,
            category: item.category as never,
          },
    )
    await tx.gallery.createMany({ data: galleryData })

    // Services: assign the supplied images.
    for (let index = 0; index < serviceRows.length; index += 1) {
      await tx.service.update({
        where: { id: serviceRows[index].id },
        data: { image: manifest.services[index % manifest.services.length] },
      })
    }

    // Barbers: assign the supplied images.
    for (let index = 0; index < barberRows.length; index += 1) {
      await tx.barber.update({
        where: { id: barberRows[index].id },
        data: { image: manifest.barbers[index % manifest.barbers.length] },
      })
    }

    // Payment shop logo.
    if (manifest.paymentLogo) {
      await tx.paymentSetting.updateMany({ data: { shopLogo: manifest.paymentLogo } })
    }

    // Remove QA test products' media and hide the products (order history is
    // referenced by foreign keys, so archive rather than hard-delete).
    if (qaProducts.length > 0) {
      const ids = qaProducts.map((product) => product.id)
      await tx.productImage.deleteMany({ where: { productId: { in: ids } } })
      await tx.product.updateMany({
        where: { id: { in: ids } },
        data: { status: 'ARCHIVED', isActive: false },
      })
    }

    // Archive the old official product and clear its obsolete images.
    for (const product of oldOfficial) {
      await tx.productImage.deleteMany({ where: { productId: product.id } })
      await tx.product.update({
        where: { id: product.id },
        data: { status: 'ARCHIVED', isActive: false },
      })
    }

    // New marketplace products from the supplied photos.
    const created: number[] = []
    for (let index = 0; index < manifest.products.length; index += 1) {
      const group = manifest.products[index]
      const category = await tx.productCategory.findFirst({ where: { name: group.categoryName }, select: { id: true } })
      const product = await tx.product.create({
        data: {
          vendorId: officialVendor.id,
          categoryId: category?.id ?? null,
          name: group.name,
          slug: newProductSlugs[index],
          description: group.description,
          brand: 'Sawaba',
          price: group.price,
          stock: 25,
          status: 'ACTIVE',
          isActive: true,
          approvedAt: new Date(),
          images: {
            create: group.images.map((url, imageIndex) => ({
              url,
              sortOrder: imageIndex,
              isPrimary: imageIndex === 0,
              mediaType: 'IMAGE',
              alt: `${group.name} image ${imageIndex + 1}`,
            })),
          },
        },
      })
      created.push(product.id)
    }

    return { created, gallery: galleryData.length, services: serviceRows.length, barbers: barberRows.length }
  })

  // ── Delete obsolete assets (after the DB is consistent) ─────────────────
  let localDeleted = 0
  for (const file of oldLocalFiles) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file)
        localDeleted += 1
      }
    } catch {
      /* ignore */
    }
  }
  let cloudDeleted = 0
  for (const asset of oldCloudinary) {
    try {
      if (asset.type === 'video') await deleteVideoByUrl(asset.url)
      else await deleteImageByUrl(asset.url)
      cloudDeleted += 1
    } catch {
      /* ignore */
    }
  }

  // Remove now-empty seed/service/barber folders for replaced sections.
  for (const folder of ['seed', 'sawaba-services', 'sawaba-barbers']) {
    const dir = path.join(uploadsRoot, folder)
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
    } catch {
      /* ignore */
    }
  }

  console.log('APPLIED')
  console.log(`gallery entries: ${result.gallery}`)
  console.log(`services re-imaged: ${result.services}`)
  console.log(`barbers re-imaged: ${result.barbers}`)
  console.log(`new products: ${result.created.join(', ')}`)
  console.log(`removed media from QA products (archived): ${qaProducts.length}`)
  console.log(`archived old official products: ${oldOfficial.length}`)
  console.log(`deleted local files: ${localDeleted}`)
  console.log(`deleted cloudinary assets: ${cloudDeleted}`)
}

main()
  .catch((error) => {
    console.error('[apply-media] failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
