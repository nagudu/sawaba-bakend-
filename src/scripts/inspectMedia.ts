import 'dotenv/config'
import { prisma } from '../config/database'

/** Read-only media inventory for the image replacement task. */

async function main() {
  const [gallery, services, barbers, products, productImages, paymentSettings, vendors, categories] = await Promise.all([
    prisma.gallery.findMany({ orderBy: { id: 'asc' } }),
    prisma.service.findMany({ orderBy: { id: 'asc' } }),
    prisma.barber.findMany({ orderBy: { id: 'asc' } }),
    prisma.product.findMany({ orderBy: { id: 'asc' }, include: { vendor: { select: { id: true, businessName: true, isOfficial: true } } } }),
    prisma.productImage.findMany({ orderBy: { id: 'asc' } }),
    prisma.paymentSetting.findMany(),
    prisma.vendor.findMany({ select: { id: true, businessName: true, isOfficial: true, status: true, logoUrl: true } }),
    prisma.productCategory.findMany({ select: { id: true, name: true, imageUrl: true } }),
  ])

  console.log('=== GALLERY', gallery.length, '===')
  for (const g of gallery) console.log(g.id, g.mediaType, g.category, JSON.stringify(g.title), 'img=', g.image, 'vid=', g.video)

  console.log('\n=== SERVICES', services.length, '===')
  for (const s of services) console.log(s.id, s.slug, s.category, 'image=', s.image)

  console.log('\n=== BARBERS', barbers.length, '===')
  for (const b of barbers) console.log(b.id, b.slug, b.name, 'image=', b.image)

  console.log('\n=== PRODUCTS', products.length, '===')
  for (const p of products) {
    const imgs = productImages.filter((i) => i.productId === p.id)
    console.log(`#${p.id} ${p.name} | vendor=${p.vendor.businessName} (official=${p.vendor.isOfficial}) | status=${p.status} | images=${imgs.length}`)
    for (const i of imgs) console.log('   ', i.id, i.mediaType, i.isPrimary ? 'PRIMARY' : '', i.url)
  }

  console.log('\n=== PAYMENT SETTINGS', paymentSettings.length, '===')
  for (const p of paymentSettings) console.log(p.id, p.shopName, 'logo=', p.shopLogo)

  console.log('\n=== VENDORS', vendors.length, '===')
  for (const v of vendors) console.log(v.id, v.businessName, 'official=', v.isOfficial, 'status=', v.status, 'logo=', v.logoUrl)

  console.log('\n=== CATEGORIES', categories.length, '===')
  for (const c of categories) console.log(c.id, c.name, 'image=', c.imageUrl)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
