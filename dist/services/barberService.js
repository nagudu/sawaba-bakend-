"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBarberAvailableToday = isBarberAvailableToday;
exports.serializeBarber = serializeBarber;
exports.serializeBarberForAdmin = serializeBarberForAdmin;
exports.createBarber = createBarber;
exports.listBarbers = listBarbers;
exports.getBarberById = getBarberById;
exports.getBarberByIdForAdmin = getBarberByIdForAdmin;
exports.updateBarber = updateBarber;
exports.deleteBarber = deleteBarber;
exports.countBarberAppointments = countBarberAppointments;
exports.getBarberAvailability = getBarberAvailability;
exports.upsertBarberAvailability = upsertBarberAvailability;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const sequelize_1 = require("sequelize");
const models_1 = require("../models");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const slug_1 = require("../utils/slug");
const mailer_1 = require("./mailer");
const availabilityService_1 = require("./availabilityService");
/** Portal passwords are always bcrypt-hashed at rest; raw values never persist. */
async function hashPortalPassword(plain) {
    return bcryptjs_1.default.hash(plain, 12);
}
/** Portal base URL — configurable for staging/production; defaults to local dev. */
function portalUrl() {
    return (process.env.PORTAL_URL ?? 'http://localhost:5173/barber').replace(/\/$/, '');
}
/**
 * Emails portal credentials to a barber when admin enables portal access.
 * The raw password exists only here (in memory) — it is never persisted or
 * logged. Failure to deliver is surfaced to the admin as a warning message
 * (the save itself already succeeded), so a broken mailer can't silently
 * leave a barber without credentials.
 */
async function sendPortalCredentialsEmail(barber, rawPassword) {
    if (!barber.email) {
        return 'No email address on file for this barber — credentials were not sent.';
    }
    try {
        const url = portalUrl();
        await (0, mailer_1.sendEmail)({
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
        });
        return null; // delivered
    }
    catch (error) {
        if (error instanceof mailer_1.EmailDeliveryError) {
            console.error(`[barber] portal credentials email to ${barber.email} failed: ${error.userMessage}`);
            return `Credentials saved, but the email could not be delivered: ${error.userMessage}`;
        }
        console.error(`[barber] portal credentials email to ${barber.email} failed unexpectedly:`, error);
        return 'Credentials saved, but the email could not be sent right now. Please share them manually.';
    }
}
/**
 * Whether the barber can take bookings today, mirroring the booking engine's
 * schedule semantics: active + on today's schedule (a configured availability
 * row with isAvailable=true, or the studio's default hours when unconfigured)
 * + the day's window hasn't fully passed (a 30-minute slot must still fit
 * before closing time). Booking conflicts are deliberately NOT considered —
 * this badge is about schedule availability, not remaining free minutes.
 */
async function isBarberAvailableToday(barber) {
    if (!barber.isActive)
        return false;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const rows = await models_1.BarberAvailability.findAll({ where: { barberId: barber.id } });
    let window;
    if (rows.length > 0) {
        const todayRow = rows.find((row) => row.dayOfWeek === dayOfWeek && row.isAvailable);
        if (!todayRow)
            return false;
        window = { start: (0, availabilityService_1.hhmmToMinutes)(todayRow.startTime), end: (0, availabilityService_1.hhmmToMinutes)(todayRow.endTime) };
    }
    else {
        const fallback = availabilityService_1.DEFAULT_HOURS[dayOfWeek];
        if (!fallback)
            return false;
        window = { start: (0, availabilityService_1.hhmmToMinutes)(fallback.start), end: (0, availabilityService_1.hhmmToMinutes)(fallback.end) };
    }
    return window.end >= nowMinutes + 30;
}
/**
 * Public serializer — deliberately OMITS barberType, location, commissionType
 * and commissionValue. Customers see the barber, not the business terms.
 */
function serializeBarber(barber, includeServices = false) {
    const base = {
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
    };
    if (includeServices && barber.services) {
        base.services = barber.services.map((service) => ({
            id: service.id,
            name: service.name,
            slug: service.slug,
            price: Number(service.price),
            duration: service.duration,
        }));
    }
    return base;
}
/** Admin serializer — public fields plus the internal business classification. */
function serializeBarberForAdmin(barber, includeServices = false) {
    const base = serializeBarber(barber, includeServices);
    base.barberType = barber.barberType ?? 'INTERNAL';
    base.location = barber.location ?? null;
    base.commissionType = barber.commissionType ?? 'PERCENTAGE';
    base.commissionValue = Number(barber.commissionValue ?? 0);
    base.portalEnabled = barber.portalEnabled ?? false;
    // Boolean only — the hash itself NEVER leaves the server.
    base.hasPortalPassword = Boolean(barber.passwordHash);
    return base;
}
const serviceScope = {
    include: [
        {
            model: models_1.Service,
            as: 'services',
            through: { attributes: [] },
        },
    ],
};
/**
 * Attaches real approved-review counts and averages to serialized barbers.
 * Counts come from the `barberId` column on reviews — never fabricated, so a
 * barber with no linked reviews shows 0 rather than a seeded placeholder.
 */
async function attachReviewStats(items) {
    if (items.length === 0)
        return;
    const rows = await models_1.Review.findAll({
        attributes: [
            'barberId',
            [(0, sequelize_1.fn)('COUNT', (0, sequelize_1.col)('Review.id')), 'count'],
            [(0, sequelize_1.fn)('AVG', (0, sequelize_1.col)('Review.rating')), 'average'],
        ],
        where: { status: 'APPROVED', barberId: { [sequelize_1.Op.in]: items.map((item) => item.id) } },
        group: ['barberId'],
        raw: true,
    });
    const stats = new Map(rows.map((row) => [Number(row.barberId), row]));
    for (const item of items) {
        const row = stats.get(item.id);
        item.reviewCount = row ? Number(row.count) : 0;
        item.reviewAverage = row ? Math.round(Number(row.average) * 10) / 10 : 0;
    }
}
async function uniqueSlug(name, excludeId) {
    const base = (0, slug_1.slugify)(name);
    let candidate = base;
    let counter = 2;
    while (true) {
        const existing = await models_1.Barber.findOne({
            where: excludeId
                ? { slug: candidate, id: { [sequelize_1.Op.not]: excludeId } }
                : { slug: candidate },
        });
        if (!existing)
            return candidate;
        candidate = `${base}-${counter}`;
        counter += 1;
    }
}
async function createBarber(input) {
    const { serviceIds, portalPassword, ...data } = input;
    const slug = await uniqueSlug(data.name);
    const barber = await models_1.Barber.create({
        ...data,
        slug,
        portalEnabled: data.portalEnabled ?? false,
        passwordHash: portalPassword ? await hashPortalPassword(portalPassword) : null,
    });
    if (serviceIds && serviceIds.length > 0) {
        await barber.setServices(serviceIds);
    }
    // New barber with portal access → email the credentials automatically.
    // credentialNotice is only ATTACHED when an email attempt actually happened
    // (null = delivered, string = failure reason) — absent otherwise — so the
    // admin UI never claims an email was sent when none was attempted.
    let credentialNotice;
    if (data.portalEnabled && portalPassword) {
        credentialNotice = await sendPortalCredentialsEmail(barber, portalPassword);
    }
    const created = await getBarberByIdForAdmin(barber.id);
    return credentialNotice === undefined ? created : { ...created, credentialNotice };
}
async function listBarbers(query, options = {}) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const includeInactive = query.includeInactive === 'true';
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
                [sequelize_1.Op.or]: [
                    { name: { [sequelize_1.Op.like]: `%${query.search}%` } },
                    { slug: { [sequelize_1.Op.like]: `%${query.search}%` } },
                    { specialty: { [sequelize_1.Op.like]: `%${query.search}%` } },
                    { biography: { [sequelize_1.Op.like]: `%${query.search}%` } },
                ],
            }
            : {}),
        // Admin-only barber-type filter — an unauthenticated request can never
        // reach this because the controller strips the param before calling.
        ...(query.barberType ? { barberType: query.barberType } : {}),
        // Coverage-area filter (#11) — partial match on external barbers' base.
        ...(query.location ? { location: { [sequelize_1.Op.like]: `%${query.location}%` } } : {}),
    };
    const availabilityFilter = query.availableToday === 'true' || query.availableToday === 'false';
    const findOptions = {
        where,
        include: [
            {
                model: models_1.Service,
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
        order: [['name', 'ASC']],
        // With an availability filter we must see ALL matches before filtering.
        ...(availabilityFilter ? {} : { offset, limit }),
    };
    const { rows, count } = await models_1.Barber.findAndCountAll(findOptions);
    // Admin callers get business fields (type/commission/location); public callers never do.
    const items = rows.map((barber) => options.adminView ? serializeBarberForAdmin(barber, true) : serializeBarber(barber, true));
    await attachReviewStats(items);
    // Attach the Available-today badge (admin views) and/or apply the filter.
    // items[i] corresponds to rows[i] (same map order), so we compute directly
    // against rows — both paths need the value.
    if (options.adminView || availabilityFilter) {
        for (let i = 0; i < items.length; i += 1) {
            ;
            items[i].availableToday = await isBarberAvailableToday(rows[i]);
        }
    }
    let finalItems = items;
    let finalTotal = count;
    if (availabilityFilter) {
        const wantAvailable = query.availableToday === 'true';
        const filtered = items.filter((item) => item.availableToday === wantAvailable);
        finalTotal = filtered.length;
        finalItems = filtered.slice(offset, offset + limit);
    }
    if (includeInactive) {
        const countRows = await models_1.Appointment.findAll({
            attributes: ['barberId', [(0, sequelize_1.fn)('COUNT', (0, sequelize_1.col)('Appointment.id')), 'count']],
            group: ['barberId'],
            raw: true,
        });
        const countMap = new Map();
        for (const row of countRows) {
            countMap.set(row.barberId, Number(row.count));
        }
        for (const item of items) {
            const total = countMap.get(item.id);
            if (typeof total === 'number')
                item.appointmentCount = total;
        }
    }
    return {
        items: finalItems,
        total: finalTotal,
        page,
        perPage,
    };
}
async function getBarberById(id) {
    const barber = await models_1.Barber.findByPk(id, serviceScope);
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    const serialized = serializeBarber(barber, true);
    await attachReviewStats([serialized]);
    return serialized;
}
async function getBarberByIdForAdmin(id) {
    const barber = await models_1.Barber.findByPk(id, serviceScope);
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    const serialized = serializeBarberForAdmin(barber, true);
    await attachReviewStats([serialized]);
    return serialized;
}
async function updateBarber(id, input) {
    const barber = await models_1.Barber.findByPk(id);
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    const { serviceIds, portalPassword, ...data } = input;
    if (Object.keys(data).length > 0 || portalPassword !== undefined) {
        const changes = { ...data };
        if (data.name && data.name !== barber.name) {
            changes.slug = await uniqueSlug(data.name, id);
        }
        if (portalPassword !== undefined) {
            // Empty string/null clears the password (disabling login); a value sets it.
            changes.passwordHash = portalPassword ? await hashPortalPassword(portalPassword) : null;
        }
        await barber.update(changes);
    }
    if (serviceIds) {
        await barber.setServices(serviceIds);
    }
    // Email credentials when a NEW password was set (either enabling the portal
    // for the first time or rotating it). Clearing the password never emails.
    // Field is absent from the response when no attempt was made (see create).
    let credentialNotice;
    if ((barber.portalEnabled ?? false) && portalPassword) {
        credentialNotice = await sendPortalCredentialsEmail(barber, portalPassword);
    }
    const fresh = await getBarberByIdForAdmin(id);
    return credentialNotice === undefined ? fresh : { ...fresh, credentialNotice };
}
/**
 * Permanently removes a barber together with their availability slots and
 * service links. Only safe for barbers with NO appointment history — the
 * controller checks that first and deactivates instead when history exists.
 */
async function deleteBarber(id) {
    const barber = await models_1.Barber.findByPk(id);
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    await models_1.BarberService.destroy({ where: { barberId: id } });
    await models_1.BarberAvailability.destroy({ where: { barberId: id } });
    await barber.destroy();
}
async function countBarberAppointments(id) {
    return models_1.Appointment.count({ where: { barberId: id } });
}
async function getBarberAvailability(barberId) {
    const barber = await models_1.Barber.findByPk(barberId);
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    return models_1.BarberAvailability.findAll({
        where: { barberId },
        order: [['dayOfWeek', 'ASC']],
    });
}
async function upsertBarberAvailability(barberId, entries) {
    const barber = await models_1.Barber.findByPk(barberId);
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    for (const entry of entries) {
        const [record] = await models_1.BarberAvailability.findOrCreate({
            where: { barberId, dayOfWeek: entry.dayOfWeek },
            defaults: { ...entry, barberId },
        });
        await record.update({
            startTime: entry.startTime,
            endTime: entry.endTime,
            isAvailable: entry.isAvailable ?? true,
        });
    }
    return getBarberAvailability(barberId);
}
//# sourceMappingURL=barberService.js.map