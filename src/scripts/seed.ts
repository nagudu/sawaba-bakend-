import bcrypt from 'bcryptjs'
import { sequelize } from '../config/database'
import { env } from '../config/env'
import { Admin, Barber, BarberAvailability, Customer, Gallery, Review, Service } from '../models'
import type { GalleryCategory } from '../types'
import { getPaymentSettingsRecord } from '../services/paymentSettingsService'
import { copySeedAsset } from '../utils/seedAssets'

interface ServiceSeed {
  name: string
  slug: string
  category: string
  description: string
  price: number
  duration: number
  image: string
}

const serviceSeeds: ServiceSeed[] = [
  {
    name: 'Normal Haircut',
    slug: 'normal-haircut',
    category: 'HAIRCUTS',
    description:
      'A precise, classic haircut tailored to your face shape and lifestyle. Includes consultation, wash, cut and a crisp finish.',
    price: 5000,
    duration: 30,
    image: copySeedAsset('normal-haircut.jpg'),
  },
  {
    name: 'Low Cut',
    slug: 'low-cut',
    category: 'HAIRCUTS',
    description:
      'A uniform, low-maintenance cut with crisp edges for a clean, confident everyday look.',
    price: 5500,
    duration: 30,
    image: copySeedAsset('low-cut.jpg'),
  },
  {
    name: 'Fade',
    slug: 'fade',
    category: 'HAIRCUTS',
    description:
      'A seamless fade from skin to longer length on top, cut and blended by a specialist for maximum impact.',
    price: 7000,
    duration: 45,
    image: copySeedAsset('fade.jpg'),
  },
  {
    name: 'Skin Fade',
    slug: 'skin-fade',
    category: 'HAIRCUTS',
    description:
      'A dramatic skin-level fade for a bold, statement look that demands attention.',
    price: 8000,
    duration: 45,
    image: copySeedAsset('skin-fade.jpg'),
  },
  {
    name: 'Beard Trim',
    slug: 'beard-trim',
    category: 'BEARDS',
    description:
      'Precision beard shaping, trimming and conditioning to keep your beard sharp and healthy.',
    price: 4500,
    duration: 25,
    image: copySeedAsset('beard-trim.jpg'),
  },
  {
    name: 'Beard Styling',
    slug: 'beard-styling',
    category: 'BEARDS',
    description:
      'Complete beard sculpting and styling service with hot towel, brush work and finishing products.',
    price: 6000,
    duration: 35,
    image: copySeedAsset('beard-styling.jpg'),
  },
  {
    name: 'Haircut & Beard',
    slug: 'haircut-and-beard',
    category: 'GROOMING',
    description:
      'Our most popular combo — a precision haircut paired with a full beard trim for one complete look.',
    price: 11000,
    duration: 60,
    image: copySeedAsset('haircut-and-beard.jpg'),
  },
  {
    name: 'Hair Washing',
    slug: 'hair-washing',
    category: 'TREATMENTS',
    description:
      'A thorough, relaxing wash with premium products that cleanses, refreshes and preps the scalp.',
    price: 3000,
    duration: 15,
    image: copySeedAsset('hair-washing.jpg'),
  },
  {
    name: 'Hair Treatment',
    slug: 'hair-treatment',
    category: 'TREATMENTS',
    description:
      'Deep conditioning and scalp treatment to restore health, strength and shine to your hair.',
    price: 9000,
    duration: 40,
    image: copySeedAsset('hair-treatment.jpg'),
  },
  {
    name: 'Facial Treatment',
    slug: 'facial-treatment',
    category: 'TREATMENTS',
    description:
      'A deep-cleansing facial that brightens, exfoliates and refreshes the skin — designed for men.',
    price: 12000,
    duration: 45,
    image: copySeedAsset('facial-treatment.jpg'),
  },
  {
    name: 'Kids Haircut',
    slug: 'kids-haircut',
    category: 'KIDS',
    description:
      'Patient, friendly haircuts for kids in a relaxed environment — with extra care for first-timers.',
    price: 4000,
    duration: 25,
    image: copySeedAsset('kids-haircut.jpg'),
  },
  {
    name: 'VIP Grooming',
    slug: 'vip-grooming',
    category: 'GROOMING',
    description:
      'A complete head-to-toe grooming experience — private suite, full styling, facial, hair treatment and refreshments.',
    price: 30000,
    duration: 120,
    image: copySeedAsset('vip-grooming.jpg'),
  },
]

interface BarberSeed {
  name: string
  slug: string
  specialty: string
  experience: number
  rating: number
  biography: string
  image: string
  serviceSlugs: string[]
}

const barberSeeds: BarberSeed[] = [
  {
    name: 'Aminu Sawaba',
    slug: 'aminu-sawaba',
    specialty: 'Master Barber & Founder',
    experience: 15,
    rating: 5.0,
    biography:
      'Founder of SAWABA, Aminu has built a reputation for precision fades and the art of the tailor-made cut.',
    image: copySeedAsset('barber-aminu.jpg'),
    serviceSlugs: ['normal-haircut', 'fade', 'skin-fade', 'haircut-and-beard', 'vip-grooming'],
  },
  {
    name: 'Tunde Adeyemi',
    slug: 'tunde-adeyemi',
    specialty: 'Fade Specialist',
    experience: 9,
    rating: 4.9,
    biography:
      'Known for razor-sharp fades and a steady hand, Tunde is a client favourite for modern, bold cuts.',
    image: copySeedAsset('barber-tunde.jpg'),
    serviceSlugs: ['fade', 'skin-fade', 'low-cut', 'normal-haircut'],
  },
  {
    name: 'Emeka Okafor',
    slug: 'emeka-okafor',
    specialty: 'Beard & Skin Fade Expert',
    experience: 8,
    rating: 4.9,
    biography:
      'Emeka sculpts beards and skin fades with surgical precision — the go-to for a statement look.',
    image: copySeedAsset('barber-emeka.jpg'),
    serviceSlugs: ['beard-trim', 'beard-styling', 'skin-fade', 'haircut-and-beard'],
  },
  {
    name: 'David Mensah',
    slug: 'david-mensah',
    specialty: 'Classic & Executive Cuts',
    experience: 12,
    rating: 4.8,
    biography:
      'David brings timeless, executive styling for the modern professional — sharp, measured, elegant.',
    image: copySeedAsset('barber-david.jpg'),
    serviceSlugs: ['normal-haircut', 'low-cut', 'haircut-and-beard', 'beard-trim'],
  },
  {
    name: 'Ibrahim Danladi',
    slug: 'ibrahim-danladi',
    specialty: 'Precision & Texture Specialist',
    experience: 6,
    rating: 4.7,
    biography:
      'A rising star, Ibrahim blends texture with precision to create cuts with natural movement.',
    image: copySeedAsset('barber-ibrahim.jpg'),
    serviceSlugs: ['fade', 'low-cut', 'normal-haircut', 'hair-washing'],
  },
  {
    name: 'Kingsley Uche',
    slug: 'kingsley-uche',
    specialty: 'Kids & Family Cuts',
    experience: 5,
    rating: 4.8,
    biography:
      'Calm, patient and brilliant with kids — Kingsley makes family visits a pleasure.',
    image: copySeedAsset('barber-kingsley.jpg'),
    serviceSlugs: ['kids-haircut', 'low-cut', 'skin-fade', 'normal-haircut'],
  },
]

const weeklySchedule: Record<number, [string, string]> = {
  0: ['11:00', '18:00'],
  1: ['09:00', '20:00'],
  2: ['09:00', '20:00'],
  3: ['09:00', '20:00'],
  4: ['09:00', '20:00'],
  5: ['09:00', '21:00'],
  6: ['08:00', '21:00'],
}

const gallerySeeds: { title: string; category: GalleryCategory; file: string }[] = [
  { title: 'Classic Fade', category: 'FADE', file: 'fade.jpg' },
  { title: 'Beard Sculpting', category: 'BEARD', file: 'beard-trim.jpg' },
  { title: 'Studio Interior', category: 'SALON', file: 'gallery-studio.jpg' },
  { title: 'Precision Cut', category: 'HAIRCUT', file: 'low-cut.jpg' },
  { title: 'Hot Towel Finish', category: 'STYLING', file: 'gallery-hottowel.jpg' },
  { title: 'The Grooming Chair', category: 'SALON', file: 'vip-grooming.jpg' },
]

const reviewSeeds: { customerName: string; rating: number; comment: string; serviceSlug: string; barberSlug?: string }[] = [
  {
    customerName: 'Musa Ibrahim',
    rating: 5,
    comment: 'Best fade in Kano, hands down. Aminu took his time and the result was flawless.',
    serviceSlug: 'fade',
    barberSlug: 'aminu-sawaba',
  },
  {
    customerName: 'Chidi Okeke',
    rating: 5,
    comment: 'Booked online, walked in, got exactly what I asked for. Very professional studio.',
    serviceSlug: 'haircut-and-beard',
    barberSlug: 'emeka-okafor',
  },
  {
    customerName: 'Sani Bello',
    rating: 4,
    comment: 'Clean environment, friendly barbers. My beard has never looked better.',
    serviceSlug: 'beard-trim',
    barberSlug: 'emeka-okafor',
  },
]

/**
 * One-time data migration: existing records whose images still point at
 * external hosts (Unsplash, Cloudinary, ...) are switched to the local
 * uploads copies created from the committed seed assets. Admin-uploaded
 * images (/uploads/...) are never touched. Idempotent — a second run is a
 * no-op because the records now start with /uploads/.
 */
async function migrateLegacyImageUrls(): Promise<void> {
  const isLegacy = (url: string | null | undefined): boolean =>
    Boolean(url) && !String(url).startsWith('/uploads/')

  for (const seed of serviceSeeds) {
    const service = await Service.findOne({ where: { slug: seed.slug } })
    if (service && isLegacy(service.image)) {
      await service.update({ image: copySeedAsset(`${seed.slug}.jpg`) })
    }
  }
  for (const seed of barberSeeds) {
    const barber = await Barber.findOne({ where: { slug: seed.slug } })
    if (barber && isLegacy(barber.image)) {
      await barber.update({ image: copySeedAsset(`barber-${seed.slug.split('-')[0]}.jpg`) })
    }
  }
  for (const item of gallerySeeds) {
    const gallery = await Gallery.findOne({ where: { title: item.title } })
    if (gallery && isLegacy(gallery.image)) {
      await gallery.update({ image: copySeedAsset(item.file) })
    }
  }
}

/**
 * Idempotent demo seeding: seed admin, services, barbers, availability,
 * gallery, approved demo reviews, payment settings and the client-demo
 * customer account. Safe to run on every boot — existing records untouched.
 */
export async function seedDatabase(): Promise<{ services: number; barbers: number; gallery: number; reviews: number; demoCustomer: boolean }> {
  await sequelize.authenticate()
  console.log('[db:seed] database connection established')

  await migrateLegacyImageUrls()

  // --- Seed admin (same source as db:sync — keeps parity with local dev) ---
  const [seedAdmin, adminCreated] = await Admin.findOrCreate({
    where: { email: env.adminSeed.email.toLowerCase() },
    defaults: {
      name: env.adminSeed.name,
      email: env.adminSeed.email.toLowerCase(),
      password: await bcrypt.hash(env.adminSeed.password, 12),
      role: 'ADMIN' as const,
    },
  })
  console.log(
    adminCreated
      ? `[db:seed] seed admin created: ${seedAdmin.email}`
      : `[db:seed] seed admin already exists: ${seedAdmin.email}`,
  )

  const serviceBySlug: Record<string, number> = {}
  for (const seed of serviceSeeds) {
    const [service, created] = await Service.findOrCreate({
      where: { slug: seed.slug },
      defaults: {
        name: seed.name,
        slug: seed.slug,
        category: seed.category,
        description: seed.description,
        price: seed.price,
        duration: seed.duration,
        image: seed.image,
        isActive: true,
      },
    })
    serviceBySlug[seed.slug] = service.id
    console.log(
      created
        ? `[db:seed] created service: ${service.name}`
        : `[db:seed] service already exists: ${service.name}`,
    )
  }

  for (const seed of barberSeeds) {
    const [barber, created] = await Barber.findOrCreate({
      where: { slug: seed.slug },
      defaults: {
        name: seed.name,
        slug: seed.slug,
        specialty: seed.specialty,
        biography: seed.biography,
        experience: seed.experience,
        rating: seed.rating,
        image: seed.image,
        isActive: true,
      },
    })

    // Only the services this barber actually performs — the booking flow
    // filters barbers by the selected service, so this mapping matters.
    const serviceIds = (seed.serviceSlugs ?? [])
      .map((slug) => serviceBySlug[slug])
      .filter((id): id is number => Boolean(id))
    await barber.setServices(serviceIds)
    console.log(
      created
        ? `[db:seed] created barber: ${barber.name} (${serviceIds.length} services)`
        : `[db:seed] reconciled barber services: ${barber.name} (${serviceIds.length} services)`,
    )

    for (const [day, [startTime, endTime]] of Object.entries(weeklySchedule)) {
      await BarberAvailability.upsert({
        barberId: barber.id,
        dayOfWeek: Number(day),
        startTime,
        endTime,
        isAvailable: true,
      })
    }
  }
  console.log('[db:seed] availability schedules upserted')

  await getPaymentSettingsRecord()
  console.log('[db:seed] default payment settings ensured')

  // --- Gallery (idempotent by title) ---
  let galleryCount = 0
  for (const item of gallerySeeds) {
    const [, created] = await Gallery.findOrCreate({
      where: { title: item.title },
      defaults: { title: item.title, image: copySeedAsset(item.file), category: item.category },
    })
    if (created) galleryCount += 1
  }
  console.log(`[db:seed] gallery ensured (${galleryCount} new)`)

  // --- Approved demo reviews (idempotent by customer name + service) ---
  const barberBySlug: Record<string, number> = {}
  for (const barberSeed of barberSeeds) {
    const found = await Barber.findOne({ where: { slug: barberSeed.slug } })
    if (found) barberBySlug[barberSeed.slug] = found.id
  }

  let reviewCount = 0
  for (const seed of reviewSeeds) {
    const service = serviceBySlug[seed.serviceSlug]
    const barberId = seed.barberSlug ? barberBySlug[seed.barberSlug] : undefined
    const [, created] = await Review.findOrCreate({
      where: { customerName: seed.customerName, serviceId: service ?? null },
      defaults: {
        customerName: seed.customerName,
        serviceId: service ?? null,
        serviceName: serviceSeeds.find((s) => s.slug === seed.serviceSlug)?.name ?? null,
        barberId: barberId ?? null,
        rating: seed.rating,
        comment: seed.comment,
        status: 'APPROVED',
        isApproved: true,
      },
    })
    if (created) reviewCount += 1
  }
  console.log(`[db:seed] demo reviews ensured (${reviewCount} new)`)

  // --- Client-demo customer account (idempotent by phone) ---
  const [demoCustomer, customerCreated] = await Customer.findOrCreate({
    where: { phone: '08000000001' },
    defaults: {
      fullName: 'Demo Customer',
      phone: '08000000001',
      email: 'customer@sawabagrooming.test',
      passwordHash: await bcrypt.hash('TestCustomer123!', 10),
    },
  })
  if (customerCreated) {
    console.log('[db:seed] demo customer account created: customer@sawabagrooming.test')
  } else {
    console.log(`[db:seed] demo customer already exists: ${demoCustomer.email ?? demoCustomer.phone}`)
  }

  return {
    services: Object.keys(serviceBySlug).length,
    barbers: barberSeeds.length,
    gallery: galleryCount,
    reviews: reviewCount,
    demoCustomer: customerCreated,
  }
}

/** CLI entry (`npm run db:seed`) — runs the seed, then closes the connection. */
async function run(): Promise<void> {
  try {
    const result = await seedDatabase()
    console.log(
      `[db:seed] done — services: ${result.services}, barbers: ${result.barbers}, gallery: ${result.gallery}, reviews: ${result.reviews}, demo customer: ${result.demoCustomer ? 'created' : 'already existed'}`,
    )
  } catch (error) {
    console.error('[db:seed] failed:', error)
    process.exitCode = 1
  } finally {
    await sequelize.close()
  }
}

// Only auto-run when executed directly (not when imported by the server).
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/seed.ts')) {
  void run()
}