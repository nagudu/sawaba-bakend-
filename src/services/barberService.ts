import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'
import type { Barber, BarberAvailability, BarberType, CommissionType, Service } from '@prisma/client'
import { NotFoundError } from '../utils/errors'
import { getPagination } from '../utils/response'
import { slugify } from '../utils/slug'
import { sendEmail, EmailDeliveryError } from './mailer'
import { DEFAULT_HOURS, hhmmToMinutes } from './availabilityService'
import type { CreateBarberInput, UpdateBarberInput } from '../validators/barber'
import type { Paged } from '../types'

async function hashPortalPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

function portalUrl(): string {
  return (process.env.PORTAL_URL ?? 'http://localhost:5173/barber').replace(/\/$/, '')
}

async function sendPortalCredentialsEmail(barber: Barber, rawPassword: string): Promise<string | null> {
  if (!barber.email) {
    return 'No email address on file for this barber — credentials were not sent.'
  }
  try {
    const url = portalUrl()
    await sendEmail({
      to: barber.email,
      subject: 'Your SAWABA Barber Portal access',
      text: [
        `Hello ${barber.name},`,
        '',
        'You have been granted access to the SAWABA Grooming Studio Barber Portal.',
        `Sign in here: ${url}`,
        '',
        `Email or phone: ${barber.email ?? barber.phone ?? ''}`,
        `Password: ${rawPassword}`,
        '',
        'For security, please change this password after your first sign-in (Profile → Change password).',
        '',
        '— SAWABA Grooming Studio',
      ].join('\n'),
      html: [
        `<p>Hello ${barber.name},</p>`,
        `<p>You have been granted access to the <strong>SAWABA Grooming Studio Barber Portal</strong>.</p>`,
        `<p><a href="${url}" style="display:inline-block;background:#c9a24b;color:#14141a;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Sign in to the Barber Portal</a></p>`,
        `<p style="font-size:14px;">Email or phone: <strong>${barber.email ?? barber.phone ?? ''}</strong><br/>Password: <strong style="font-family:monospace;font-size:15px;">${rawPassword}</strong></p>`,
        `<p style="font-size:13px;color:#666;">For security, please change this password after your first sign-in.</p>`,
        `<p style="font-size:12px;color:#999;">— SAWABA Grooming Studio</p>`,
      ].join('\n'),
    })
    return null
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      console.error(`[barber] portal credentials email to ${barber.email} failed: ${error.userMessage}`)
      return `Credentials saved, but the email could not be delivered: ${error.userMessage}`
    }
    console.error(`[barber] portal credentials email to ${barber.email} failed unexpectedly:`, error)
    return 'Credentials saved, but the email could not be sent right now. Please share them manually.'
  }
}

export interface BarberPublic {
  id: number
  name: string
  slug: string
  image: string | null
  phone: string | null
  email: string | null
  specialty: string | null
  biography: string | null
  experience: number
  rating: number
  reviewCount?: number
  reviewAverage?: number
  isActive: boolean
  availableToday?: boolean
  appointmentCount?: number
  createdAt: Date
  updatedAt: Date
  services?: Array<{ id: number; name: string; slug: string; price: number; duration: number }>
}

export interface BarberAdmin extends BarberPublic {
  barberType: 'INTERNAL' | 'EXTERNAL'
  location: string | null
  commissionType: 'PERCENTAGE' | 'FIXED'
  commissionValue: number
  portalEnabled: boolean
  hasPortalPassword?: boolean
}

export async function isBarberAvailableToday(barber: Barber): Promise<boolean> {
  if (!barber.isActive) return false
  const now = new Date()
  const dayOfWeek = now.getDay()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const rows = await prisma.barberAvailability.findMany({ where: { barberId: barber.id } })
  let window: { start: number; end: number }
  if (rows.length > 0) {
    const todayRow = rows.find((row) => row.dayOfWeek === dayOfWeek && row.isAvailable)
    if (!todayRow) return false
    window = { start: hhmmToMinutes(todayRow.startTime), end: hhmmToMinutes(todayRow.endTime) }
  } else {
    const fallback = DEFAULT_HOURS[dayOfWeek]
    if (!fallback) return false
    window = { start: hhmmToMinutes(fallback.start), end: hhmmToMinutes(fallback.end) }
  }
  return window.end >= nowMinutes + 30
}

export function serializeBarber(
  barber: Barber & { barberServices?: Array<{ service: Service }> },
  includeServices = false,
): BarberPublic {
  const base: BarberPublic = {
    id: barber.id,
    name: barber.name,
    slug: barber.slug,
    image: barber.image,
    phone: barber.phone,
    email: barber.email,
    specialty: barber.specialty,
    biography: barber.biography,
    experience: barber.experience,
    rating: Number(barber.rating),
    isActive: barber.isActive,
    createdAt: barber.createdAt,
    updatedAt: barber.updatedAt,
  }

  if (includeServices && barber.barberServices) {
    base.services = barber.barberServices.map((bs) => ({
      id: bs.service.id,
      name: bs.service.name,
      slug: bs.service.slug,
      price: Number(bs.service.price),
      duration: bs.service.duration,
    }))
  }

  return base
}

export function serializeBarberForAdmin(
  barber: Barber & { barberServices?: Array<{ service: Service }> },
  includeServices = false,
): BarberAdmin {
  const base = serializeBarber(barber, includeServices) as BarberAdmin
  base.barberType = (barber.barberType as 'INTERNAL' | 'EXTERNAL') ?? 'INTERNAL'
  base.location = barber.location ?? null
  base.commissionType = (barber.commissionType as 'PERCENTAGE' | 'FIXED') ?? 'PERCENTAGE'
  base.commissionValue = Number(barber.commissionValue ?? 0)
  base.portalEnabled = barber.portalEnabled ?? false
  base.hasPortalPassword = Boolean(barber.passwordHash)
  return base
}

async function attachReviewStats(items: BarberPublic[]): Promise<void> {
  if (items.length === 0) return
  const barberIds = items.map((item) => item.id)

  const reviews = await prisma.review.findMany({
    where: { status: 'APPROVED', barberId: { in: barberIds } },
    select: { barberId: true, rating: true },
  })

  const stats = new Map<number, { count: number; sum: number }>()
  for (const r of reviews) {
    if (!r.barberId) continue
    const current = stats.get(r.barberId) ?? { count: 0, sum: 0 }
    current.count += 1
    current.sum += r.rating
    stats.set(r.barberId, current)
  }

  for (const item of items) {
    const stat = stats.get(item.id)
    item.reviewCount = stat ? stat.count : 0
    item.reviewAverage = stat && stat.count > 0 ? Math.round((stat.sum / stat.count) * 10) / 10 : 0
  }
}

async function uniqueSlug(name: string, excludeId?: number): Promise<string> {
  const base = slugify(name)
  let candidate = base
  let counter = 2

  while (true) {
    const existing = await prisma.barber.findFirst({
      where: excludeId
        ? { slug: candidate, id: { not: excludeId } }
        : { slug: candidate },
    })
    if (!existing) return candidate
    candidate = `${base}-${counter}`
    counter += 1
  }
}

export async function createBarber(
  input: CreateBarberInput,
): Promise<BarberAdmin & { credentialNotice?: string | null }> {
  const { serviceIds, portalPassword, ...data } = input
  const slug = await uniqueSlug(data.name)

  const passwordHash = portalPassword ? await hashPortalPassword(portalPassword) : null

  const barber = await prisma.barber.create({
    data: {
      name: data.name,
      slug,
      image: data.image ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      specialty: data.specialty ?? null,
      biography: data.biography ?? null,
      experience: data.experience ?? 0,
      rating: data.rating ?? 0.0,
      barberType: (data.barberType as BarberType) ?? 'INTERNAL',
      location: data.location ?? null,
      commissionType: (data.commissionType as CommissionType) ?? 'PERCENTAGE',
      commissionValue: data.commissionValue ?? 0.0,
      isActive: data.isActive ?? true,
      portalEnabled: data.portalEnabled ?? false,
      passwordHash,
      ...(serviceIds && serviceIds.length > 0
        ? {
            barberServices: {
              create: serviceIds.map((serviceId) => ({ serviceId })),
            },
          }
        : {}),
    },
  })

  let credentialNotice: string | null | undefined
  if (data.portalEnabled && portalPassword) {
    credentialNotice = await sendPortalCredentialsEmail(barber, portalPassword)
  }
  const created = await getBarberByIdForAdmin(barber.id)
  return credentialNotice === undefined ? created : { ...created, credentialNotice }
}

export async function listBarbers(
  query: {
    serviceId?: number
    isActive?: string
    includeInactive?: string
    search?: string
    barberType?: string
    location?: string
    availableToday?: string
    page?: number
    perPage?: number
  },
  options: { adminView?: boolean } = {},
): Promise<Paged<BarberPublic>> {
  const { page, perPage, offset, limit } = getPagination(query as Record<string, unknown>)
  const includeInactive = query.includeInactive === 'true'

  const where: {
    isActive?: boolean
    barberType?: BarberType
    location?: { contains: string }
    barberServices?: { some: { serviceId: number } }
    OR?: Array<{
      name?: { contains: string }
      slug?: { contains: string }
      specialty?: { contains: string }
      biography?: { contains: string }
    }>
  } = {}

  if (!includeInactive) {
    where.isActive = true
  } else if (query.isActive !== undefined) {
    where.isActive = query.isActive === 'true'
  }

  if (query.search) {
    const search = query.search
    where.OR = [
      { name: { contains: search } },
      { slug: { contains: search } },
      { specialty: { contains: search } },
      { biography: { contains: search } },
    ]
  }

  if (query.barberType) {
    where.barberType = query.barberType as BarberType
  }

  if (query.location) {
    where.location = { contains: query.location }
  }

  if (query.serviceId) {
    where.barberServices = { some: { serviceId: query.serviceId } }
  }

  const availabilityFilter = query.availableToday === 'true' || query.availableToday === 'false'

  let rows: Array<Barber & { barberServices: Array<{ service: Service }> }>
  let count: number

  if (availabilityFilter) {
    rows = await prisma.barber.findMany({
      where,
      include: { barberServices: { include: { service: true } } },
      orderBy: { name: 'asc' },
    })
    count = rows.length
  } else {
    ;[rows, count] = await Promise.all([
      prisma.barber.findMany({
        where,
        include: { barberServices: { include: { service: true } } },
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit,
      }),
      prisma.barber.count({ where }),
    ])
  }

  const items = rows.map((barber) =>
    options.adminView ? serializeBarberForAdmin(barber, true) : serializeBarber(barber, true),
  )
  await attachReviewStats(items)

  if (options.adminView || availabilityFilter) {
    for (let i = 0; i < items.length; i += 1) {
      ;(items[i] as BarberAdmin).availableToday = await isBarberAvailableToday(rows[i])
    }
  }

  let finalItems = items
  let finalTotal = count
  if (availabilityFilter) {
    const wantAvailable = query.availableToday === 'true'
    const filtered = items.filter(
      (item) => (item as BarberAdmin).availableToday === wantAvailable,
    )
    finalTotal = filtered.length
    finalItems = filtered.slice(offset, offset + limit)
  }

  if (includeInactive) {
    const countGroups = await prisma.appointment.groupBy({
      by: ['barberId'],
      _count: { id: true },
    })
    const countMap = new Map<number, number>()
    for (const g of countGroups) {
      countMap.set(g.barberId, g._count.id)
    }
    for (const item of items) {
      const total = countMap.get(item.id)
      if (typeof total === 'number') item.appointmentCount = total
    }
  }

  return {
    items: finalItems,
    total: finalTotal,
    page,
    perPage,
  }
}

export async function getBarberById(id: number): Promise<BarberPublic> {
  const barber = await prisma.barber.findUnique({
    where: { id },
    include: { barberServices: { include: { service: true } } },
  })
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }
  const serialized = serializeBarber(barber, true)
  await attachReviewStats([serialized])
  return serialized
}

export async function getBarberByIdForAdmin(id: number): Promise<BarberAdmin> {
  const barber = await prisma.barber.findUnique({
    where: { id },
    include: { barberServices: { include: { service: true } } },
  })
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }
  const serialized = serializeBarberForAdmin(barber, true)
  await attachReviewStats([serialized])
  return serialized
}

export async function updateBarber(
  id: number,
  input: UpdateBarberInput,
): Promise<BarberAdmin & { credentialNotice?: string | null }> {
  const barber = await prisma.barber.findUnique({ where: { id } })
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }

  const { serviceIds, portalPassword, ...data } = input

  let passwordHash = barber.passwordHash
  if (portalPassword !== undefined) {
    passwordHash = portalPassword ? await hashPortalPassword(portalPassword) : null
  }

  let slug = barber.slug
  if (data.name && data.name !== barber.name) {
    slug = await uniqueSlug(data.name, id)
  }

  await prisma.$transaction(async (tx) => {
    await tx.barber.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name, slug } : {}),
        ...(data.image !== undefined ? { image: data.image } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.specialty !== undefined ? { specialty: data.specialty } : {}),
        ...(data.biography !== undefined ? { biography: data.biography } : {}),
        ...(data.experience !== undefined ? { experience: data.experience } : {}),
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
        ...(data.barberType !== undefined ? { barberType: data.barberType as BarberType } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.commissionType !== undefined ? { commissionType: data.commissionType as CommissionType } : {}),
        ...(data.commissionValue !== undefined ? { commissionValue: data.commissionValue } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.portalEnabled !== undefined ? { portalEnabled: data.portalEnabled } : {}),
        ...(portalPassword !== undefined ? { passwordHash } : {}),
      },
    })

    if (serviceIds) {
      await tx.barberService.deleteMany({ where: { barberId: id } })
      if (serviceIds.length > 0) {
        await tx.barberService.createMany({
          data: serviceIds.map((serviceId) => ({ barberId: id, serviceId })),
        })
      }
    }
  })

  let credentialNotice: string | null | undefined
  if ((data.portalEnabled ?? barber.portalEnabled) && portalPassword) {
    const updated = await prisma.barber.findUnique({ where: { id } })
    if (updated) {
      credentialNotice = await sendPortalCredentialsEmail(updated, portalPassword)
    }
  }

  const fresh = await getBarberByIdForAdmin(id)
  return credentialNotice === undefined ? fresh : { ...fresh, credentialNotice }
}

export async function deleteBarber(id: number): Promise<void> {
  const barber = await prisma.barber.findUnique({ where: { id } })
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }
  await prisma.$transaction([
    prisma.barberService.deleteMany({ where: { barberId: id } }),
    prisma.barberAvailability.deleteMany({ where: { barberId: id } }),
    prisma.barber.delete({ where: { id } }),
  ])
}

export async function deactivateBarber(id: number): Promise<void> {
  const barber = await prisma.barber.findUnique({ where: { id } })
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }
  await prisma.barber.update({
    where: { id },
    data: { isActive: false },
  })
}

export async function countBarberAppointments(id: number): Promise<number> {
  return prisma.appointment.count({ where: { barberId: id } })
}

export async function getBarberAvailability(barberId: number): Promise<BarberAvailability[]> {
  const barber = await prisma.barber.findUnique({ where: { id: barberId } })
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }
  return prisma.barberAvailability.findMany({
    where: { barberId },
    orderBy: { dayOfWeek: 'asc' },
  })
}

export async function upsertBarberAvailability(
  barberId: number,
  entries: Array<{
    dayOfWeek: number
    startTime: string
    endTime: string
    isAvailable?: boolean
  }>,
): Promise<BarberAvailability[]> {
  const barber = await prisma.barber.findUnique({ where: { id: barberId } })
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.barberAvailability.upsert({
        where: {
          barberId_dayOfWeek: {
            barberId,
            dayOfWeek: entry.dayOfWeek,
          },
        },
        create: {
          barberId,
          dayOfWeek: entry.dayOfWeek,
          startTime: entry.startTime,
          endTime: entry.endTime,
          isAvailable: entry.isAvailable ?? true,
        },
        update: {
          startTime: entry.startTime,
          endTime: entry.endTime,
          isAvailable: entry.isAvailable ?? true,
        },
      }),
    ),
  )

  return getBarberAvailability(barberId)
}