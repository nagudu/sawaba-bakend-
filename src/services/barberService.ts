import bcrypt from 'bcryptjs'
import { Op, fn, col } from 'sequelize'
import { Barber, BarberAvailability, BarberService, Review, Service, Appointment } from '../models'
import { NotFoundError } from '../utils/errors'
import { getPagination } from '../utils/response'
import { slugify } from '../utils/slug'
import { sendEmail, EmailDeliveryError } from './mailer'
import { DEFAULT_HOURS, hhmmToMinutes } from './availabilityService'
import type { CreateBarberInput, UpdateBarberInput } from '../validators/barber'
import type { Paged } from '../types'

/** Portal passwords are always bcrypt-hashed at rest; raw values never persist. */
async function hashPortalPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

/** Portal base URL — configurable for staging/production; defaults to local dev. */
function portalUrl(): string {
  return (process.env.PORTAL_URL ?? 'http://localhost:5173/barber').replace(/\/$/, '')
}

/**
 * Emails portal credentials to a barber when admin enables portal access.
 * The raw password exists only here (in memory) — it is never persisted or
 * logged. Failure to deliver is surfaced to the admin as a warning message
 * (the save itself already succeeded), so a broken mailer can't silently
 * leave a barber without credentials.
 */
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
    return null // delivered
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
  /** True when the barber can take bookings today (schedule not passed / not off-duty). Admin views only. */
  availableToday?: boolean
  appointmentCount?: number
  createdAt: Date
  updatedAt: Date
  services?: Array<{ id: number; name: string; slug: string; price: number; duration: number }>
}

/** Admin-only business fields (requirement #16/#23) — never serialized publicly. */
export interface BarberAdmin extends BarberPublic {
  barberType: 'INTERNAL' | 'EXTERNAL'
  location: string | null
  commissionType: 'PERCENTAGE' | 'FIXED'
  commissionValue: number
  /** Whether the barber may sign in to the Barber Portal. */
  portalEnabled: boolean
  /** Whether a portal password exists (true/false — the hash never leaves the server). */
  hasPortalPassword: boolean
}

/**
 * Whether the barber can take bookings today, mirroring the booking engine's
 * schedule semantics: active + on today's schedule (a configured availability
 * row with isAvailable=true, or the studio's default hours when unconfigured)
 * + the day's window hasn't fully passed (a 30-minute slot must still fit
 * before closing time). Booking conflicts are deliberately NOT considered —
 * this badge is about schedule availability, not remaining free minutes.
 */
export async function isBarberAvailableToday(barber: Barber): Promise<boolean> {
  if (!barber.isActive) return false
  const now = new Date()
  const dayOfWeek = now.getDay()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const rows = await BarberAvailability.findAll({ where: { barberId: barber.id } })
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

/**
 * Public serializer — deliberately OMITS barberType, location, commissionType
 * and commissionValue. Customers see the barber, not the business terms.
 */
export function serializeBarber(
  barber: Barber,
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

  if (includeServices && barber.services) {
    base.services = barber.services.map((service) => ({
      id: service.id,
      name: service.name,
      slug: service.slug,
      price: Number(service.price),
      duration: service.duration,
    }))
  }

  return base
}

/** Admin serializer — public fields plus the internal business classification. */
export function serializeBarberForAdmin(
  barber: Barber,
  includeServices = false,
): BarberAdmin {
  const base = serializeBarber(barber, includeServices) as BarberAdmin
  base.barberType = barber.barberType ?? 'INTERNAL'
  base.location = barber.location ?? null
  base.commissionType = barber.commissionType ?? 'PERCENTAGE'
  base.commissionValue = Number(barber.commissionValue ?? 0)
  base.portalEnabled = barber.portalEnabled ?? false
  // Boolean only — the hash itself NEVER leaves the server.
  base.hasPortalPassword = Boolean(barber.passwordHash)
  return base
}

const serviceScope = {
  include: [
    {
      model: Service,
      as: 'services',
      through: { attributes: [] },
    },
  ],
}

/**
 * Attaches real approved-review counts and averages to serialized barbers.
 * Counts come from the `barberId` column on reviews — never fabricated, so a
 * barber with no linked reviews shows 0 rather than a seeded placeholder.
 */
async function attachReviewStats(items: BarberPublic[]): Promise<void> {
  if (items.length === 0) return
  const rows = await Review.findAll({
    attributes: [
      'barberId',
      [fn('COUNT', col('Review.id')), 'count'],
      [fn('AVG', col('Review.rating')), 'average'],
    ],
    where: { status: 'APPROVED', barberId: { [Op.in]: items.map((item) => item.id) } },
    group: ['barberId'],
    raw: true,
  })
  const stats = new Map(
    (rows as unknown as Array<{ barberId: number; count: string | number; average: string | number }>).map(
      (row) => [Number(row.barberId), row],
    ),
  )
  for (const item of items) {
    const row = stats.get(item.id)
    item.reviewCount = row ? Number(row.count) : 0
    item.reviewAverage = row ? Math.round(Number(row.average) * 10) / 10 : 0
  }
}

async function uniqueSlug(name: string, excludeId?: number): Promise<string> {
  const base = slugify(name)
  let candidate = base
  let counter = 2

  while (true) {
    const existing = await Barber.findOne({
      where: excludeId
        ? { slug: candidate, id: { [Op.not]: excludeId } }
        : { slug: candidate },
    })
    if (!existing) return candidate
    candidate = `${base}-${counter}`
    counter += 1
  }
}

export async function createBarber(input: CreateBarberInput): Promise<BarberAdmin & { credentialNotice?: string | null }> {
  const { serviceIds, portalPassword, ...data } = input
  const slug = await uniqueSlug(data.name)
  const barber = await Barber.create({
    ...data,
    slug,
    portalEnabled: data.portalEnabled ?? false,
    passwordHash: portalPassword ? await hashPortalPassword(portalPassword) : null,
  })

  if (serviceIds && serviceIds.length > 0) {
    await barber.setServices(serviceIds)
  }

  // New barber with portal access → email the credentials automatically.
  // credentialNotice is only ATTACHED when an email attempt actually happened
  // (null = delivered, string = failure reason) — absent otherwise — so the
  // admin UI never claims an email was sent when none was attempted.
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
  // Availability is computed from per-barber schedule rows (not a column), so
  // an availableToday filter can't run in SQL. When set, we fetch ALL matching
  // rows, compute availability, filter, then paginate in memory — correct
  // pagination beats an offset-then-filter bug. Barber tables are small
  // (tens of rows), so this is cheap.

  const where = {
    ...(!includeInactive
      ? { isActive: true }
      : query.isActive
        ? { isActive: query.isActive === 'true' }
        : {}),
    ...(query.search
      ? {
          [Op.or]: [
            { name: { [Op.like]: `%${query.search}%` } },
            { slug: { [Op.like]: `%${query.search}%` } },
            { specialty: { [Op.like]: `%${query.search}%` } },
            { biography: { [Op.like]: `%${query.search}%` } },
          ],
        }
      : {}),
    // Admin-only barber-type filter — an unauthenticated request can never
    // reach this because the controller strips the param before calling.
    ...(query.barberType ? { barberType: query.barberType as 'INTERNAL' | 'EXTERNAL' } : {}),
    // Coverage-area filter (#11) — partial match on external barbers' base.
    ...(query.location ? { location: { [Op.like]: `%${query.location}%` } } : {}),
  }

  const availabilityFilter = query.availableToday === 'true' || query.availableToday === 'false'
  const findOptions = {
    where,
    include: [
      {
        model: Service,
        as: 'services',
        through: { attributes: [] },
        // When filtering by serviceId, use INNER JOIN (required: true) so only
        // barbers assigned to that service are returned.
        // Without a serviceId filter, use LEFT JOIN (required: false) so barbers
        // with no service assignments still appear in the list.
        ...(query.serviceId
          ? { where: { id: query.serviceId }, required: true }
          : { required: false }),
      },
    ],
    distinct: true,
    order: [['name', 'ASC']] as [string, string][],
    // With an availability filter we must see ALL matches before filtering.
    ...(availabilityFilter ? {} : { offset, limit }),
  }

  const { rows, count } = await Barber.findAndCountAll(findOptions)

  // Admin callers get business fields (type/commission/location); public callers never do.
  const items = rows.map((barber) =>
    options.adminView ? serializeBarberForAdmin(barber, true) : serializeBarber(barber, true),
  )
  await attachReviewStats(items)

  // Attach the Available-today badge (admin views) and/or apply the filter.
  // items[i] corresponds to rows[i] (same map order), so we compute directly
  // against rows — both paths need the value.
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
    const countRows = await Appointment.findAll({
      attributes: ['barberId', [fn('COUNT', col('Appointment.id')), 'count']],
      group: ['barberId'],
      raw: true,
    })
    const countMap = new Map<number, number>()
    for (const row of countRows as unknown as Array<{ barberId: number; count: string }>) {
      countMap.set(row.barberId, Number(row.count))
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
  const barber = await Barber.findByPk(id, serviceScope)
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }
  const serialized = serializeBarber(barber, true)
  await attachReviewStats([serialized])
  return serialized
}

export async function getBarberByIdForAdmin(id: number): Promise<BarberAdmin> {
  const barber = await Barber.findByPk(id, serviceScope)
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }
  const serialized = serializeBarberForAdmin(barber, true)
  await attachReviewStats([serialized])
  return serialized
}

export async function updateBarber(id: number, input: UpdateBarberInput): Promise<BarberAdmin & { credentialNotice?: string | null }> {
  const barber = await Barber.findByPk(id)
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }

  const { serviceIds, portalPassword, ...data } = input

  if (Object.keys(data).length > 0 || portalPassword !== undefined) {
    const changes: Record<string, unknown> = { ...data }
    if (data.name && data.name !== barber.name) {
      changes.slug = await uniqueSlug(data.name, id)
    }
    if (portalPassword !== undefined) {
      // Empty string/null clears the password (disabling login); a value sets it.
      changes.passwordHash = portalPassword ? await hashPortalPassword(portalPassword) : null
    }
    await barber.update(changes)
  }
  if (serviceIds) {
    await barber.setServices(serviceIds)
  }

  // Email credentials when a NEW password was set (either enabling the portal
  // for the first time or rotating it). Clearing the password never emails.
  // Field is absent from the response when no attempt was made (see create).
  let credentialNotice: string | null | undefined
  if ((barber.portalEnabled ?? false) && portalPassword) {
    credentialNotice = await sendPortalCredentialsEmail(barber, portalPassword)
  }
  const fresh = await getBarberByIdForAdmin(id)
  return credentialNotice === undefined ? fresh : { ...fresh, credentialNotice }
}

/**
 * Permanently removes a barber together with their availability slots and
 * service links. Only safe for barbers with NO appointment history — the
 * controller checks that first and deactivates instead when history exists.
 */
export async function deleteBarber(id: number): Promise<void> {
  const barber = await Barber.findByPk(id)
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }
  await BarberService.destroy({ where: { barberId: id } })
  await BarberAvailability.destroy({ where: { barberId: id } })
  await barber.destroy()
}

export async function countBarberAppointments(id: number): Promise<number> {
  return Appointment.count({ where: { barberId: id } })
}

export async function getBarberAvailability(barberId: number): Promise<BarberAvailability[]> {
  const barber = await Barber.findByPk(barberId)
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }
  return BarberAvailability.findAll({
    where: { barberId },
    order: [['dayOfWeek', 'ASC']],
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
  const barber = await Barber.findByPk(barberId)
  if (!barber) {
    throw new NotFoundError('Barber not found.')
  }

  for (const entry of entries) {
    const [record] = await BarberAvailability.findOrCreate({
      where: { barberId, dayOfWeek: entry.dayOfWeek },
      defaults: { ...entry, barberId },
    })
    await record.update({
      startTime: entry.startTime,
      endTime: entry.endTime,
      isAvailable: entry.isAvailable ?? true,
    })
  }

  return getBarberAvailability(barberId)
}