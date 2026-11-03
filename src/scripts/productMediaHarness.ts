import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'

/**
 * End-to-end check for the product media pipeline:
 *  - admin create with multiple images (server-side upload),
 *  - adding a video via direct-upload metadata + setting it primary,
 *  - removing media and deleting the underlying asset,
 *  - validation of foreign URLs and oversized video duration,
 *  - vendor ownership scoping.
 *
 * Creates temporary QA accounts/products, deleted afterwards. Run with
 * `npm run media:test` while the backend is running.
 */

const BASE = `http://127.0.0.1:${process.env.PORT ?? 5000}`
const FORWARDED_FOR = `10.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

const results: string[] = []
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function request(
  method: string,
  path: string,
  options: { token?: string; form?: FormData; json?: unknown } = {},
): Promise<{ status: number; data: any; message?: string }> {
  const headers: Record<string, string> = { 'X-Forwarded-For': FORWARDED_FOR }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.form ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined),
  })
  const payload = (await response.json().catch(() => ({}))) as { data?: unknown; message?: string }
  return { status: response.status, data: payload.data, message: payload.message }
}

function adminProductForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData()
  form.set('name', `QA Media Product ${Date.now().toString(36)}`)
  form.set('description', 'Quality-assurance product created by the media test harness.')
  form.set('brand', 'QA')
  form.set('sku', '')
  form.set('categoryId', '')
  form.set('price', '2500')
  form.set('compareAtPrice', '')
  form.set('stock', '5')
  form.set('status', 'DRAFT')
  form.set('isActive', 'true')
  for (const [key, value] of Object.entries(overrides)) form.set(key, value)
  return form
}

function attachImages(form: FormData, count: number): void {
  for (let i = 0; i < count; i += 1) {
    form.append('images', new Blob([PNG], { type: 'image/png' }), `qa-${Date.now()}-${i}.png`)
  }
}

async function main(): Promise<void> {
  const stamp = Date.now().toString(36)
  const password = 'QaPassw0rd!'
  const hash = await bcrypt.hash(password, 10)
  let productId = 0
  let vendorId = 0
  let adminToken: string | undefined

  try {
    const adminLogin = await request('POST', '/api/auth/login', {
      json: {
        email: process.env.ADMIN_SEED_EMAIL ?? 'admin@sawabasalon.com',
        password: process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe123!',
      },
    })
    adminToken = adminLogin.data?.token as string | undefined
    check('admin login', Boolean(adminToken), `status ${adminLogin.status}`)

    // ── Create with two images ───────────────────────────────────────────────
    const createForm = adminProductForm()
    attachImages(createForm, 2)
    const created = await request('POST', '/api/admin/marketplace/products', { token: adminToken, form: createForm })
    productId = created.data?.id ?? 0
    const createdImages: any[] = created.data?.images ?? []
    check('create product with 2 images', created.status === 201 && createdImages.length === 2, `status ${created.status}, images ${createdImages.length}`)
    check('images marked as IMAGE type', createdImages.every((image) => image.mediaType === 'IMAGE'))
    check('exactly one primary media', createdImages.filter((image) => image.isPrimary).length === 1)

    // ── Add a direct-uploaded video and make it primary ──────────────────────
    const videoUrl = `https://res.cloudinary.com/demo/video/upload/sawaba-products/qa-${stamp}.mp4`
    const videoJson = JSON.stringify([
      { url: videoUrl, mediaType: 'VIDEO', publicId: `sawaba-products/qa-${stamp}`, thumbnailUrl: `${videoUrl}.jpg`, duration: 12 },
    ])
    const withVideoForm = adminProductForm({ name: created.data?.name ?? 'QA product' })
    withVideoForm.set('existingMedia', JSON.stringify(createdImages.map((image) => ({ id: image.id, isPrimary: false }))))
    withVideoForm.set('mediaJson', videoJson)
    withVideoForm.set('primaryUrl', videoUrl)
    const withVideo = await request('PUT', `/api/admin/marketplace/products/${productId}`, { token: adminToken, form: withVideoForm })
    const videoMedia = (withVideo.data?.images ?? []).find((image: any) => image.mediaType === 'VIDEO')
    check('video added', Boolean(videoMedia), `status ${withVideo.status}, message ${withVideo.message ?? ''}`)
    check('video poster derived', Boolean(videoMedia?.thumbnailUrl?.endsWith('.jpg')))
    check('video set as primary', videoMedia?.isPrimary === true)

    // ── Remove an image (keeps first image only, drops the video) ─────────────
    const firstImageId = createdImages[0]?.id
    const pruneForm = adminProductForm({ name: created.data?.name ?? 'QA product' })
    pruneForm.set('existingMedia', JSON.stringify([{ id: firstImageId, isPrimary: true }]))
    const pruned = await request('PUT', `/api/admin/marketplace/products/${productId}`, { token: adminToken, form: pruneForm })
    const prunedImages: any[] = pruned.data?.images ?? []
    check('media removed on update', prunedImages.length === 1 && prunedImages[0]?.id === firstImageId, `kept ${prunedImages.length}`)

    // ── Validation ───────────────────────────────────────────────────────────
    const foreignForm = adminProductForm({ name: created.data?.name ?? 'QA product' })
    foreignForm.set('existingMedia', JSON.stringify([{ id: firstImageId, isPrimary: true }]))
    foreignForm.set('mediaJson', JSON.stringify([{ url: 'https://evil.example.com/bad.mp4', mediaType: 'VIDEO' }]))
    const foreign = await request('PUT', `/api/admin/marketplace/products/${productId}`, { token: adminToken, form: foreignForm })
    check('foreign media URL rejected', foreign.status === 422, `status ${foreign.status}`)

    const tooLongForm = adminProductForm({ name: created.data?.name ?? 'QA product' })
    tooLongForm.set('existingMedia', JSON.stringify([{ id: firstImageId, isPrimary: true }]))
    tooLongForm.set('mediaJson', JSON.stringify([{ url: `https://res.cloudinary.com/demo/video/upload/sawaba-products/long-${stamp}.mp4`, mediaType: 'VIDEO', duration: 999 }]))
    const tooLong = await request('PUT', `/api/admin/marketplace/products/${productId}`, { token: adminToken, form: tooLongForm })
    check('oversized video duration rejected', tooLong.status === 422, `status ${tooLong.status}`)

    // ── Vendor ownership scoping ─────────────────────────────────────────────
    const vendor = await prisma.vendor.create({
      data: {
        businessName: `QA Media Vendor ${stamp}`,
        contactName: 'QA Vendor',
        slug: `qa-media-vendor-${stamp}`,
        email: `qa-media-vendor-${stamp}@sawaba.test`,
        phone: `+23483${stamp.replace(/\D/g, '').slice(-9).padStart(9, '4')}`,
        passwordHash: hash,
        status: 'APPROVED',
        isActive: true,
        commissionRate: 10,
        approvedAt: new Date(),
      },
    })
    vendorId = vendor.id
    const vendorLogin = await request('POST', '/api/vendor/login', { json: { identifier: vendor.email, password } })
    const vendorToken = vendorLogin.data?.token as string | undefined
    check('vendor login', Boolean(vendorToken), `status ${vendorLogin.status}`)

    const hijackForm = adminProductForm({ name: 'Hijack attempt' })
    attachImages(hijackForm, 1)
    const hijack = await request('PUT', `/api/vendor/products/${productId}`, { token: vendorToken, form: hijackForm })
    check('vendor cannot edit another vendor product', hijack.status === 404, `status ${hijack.status}`)

    const ownForm = adminProductForm({ name: `QA Vendor Own Product ${stamp}` })
    attachImages(ownForm, 1)
    const own = await request('POST', '/api/vendor/products', { token: vendorToken, form: ownForm })
    check('vendor creates own product with media', (own.status === 201 || own.status === 200) && (own.data?.images ?? []).length === 1, `status ${own.status}`)
    if (own.data?.id) await request('DELETE', `/api/vendor/products/${own.data.id}`, { token: vendorToken })
  } finally {
    if (productId) await request('DELETE', `/api/admin/marketplace/products/${productId}`, { token: adminToken }).catch(() => undefined)
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined)
    if (vendorId) {
      await prisma.product.deleteMany({ where: { vendorId } }).catch(() => undefined)
      await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => undefined)
    }
  }
}

main()
  .then(() => {
    console.log(results.join('\n'))
    console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`)
    if (failures > 0) process.exitCode = 1
  })
  .catch((error) => {
    console.error('[media-test] crashed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
