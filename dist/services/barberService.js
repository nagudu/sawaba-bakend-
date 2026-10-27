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
exports.deactivateBarber = deactivateBarber;
exports.countBarberAppointments = countBarberAppointments;
exports.getBarberAvailability = getBarberAvailability;
exports.upsertBarberAvailability = upsertBarberAvailability;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const slug_1 = require("../utils/slug");
const mailer_1 = require("./mailer");
const availabilityService_1 = require("./availabilityService");
async function hashPortalPassword(plain) {
    return bcryptjs_1.default.hash(plain, 12);
}
function portalUrl() {
    return (process.env.PORTAL_URL ?? 'http://localhost:5173/barber').replace(/\/$/, '');
}
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
        return null;
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
async function isBarberAvailableToday(barber) {
    if (!barber.isActive)
        return false;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const rows = await database_1.prisma.barberAvailability.findMany({ where: { barberId: barber.id } });
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
    if (includeServices && barber.barberServices) {
        base.services = barber.barberServices.map((bs) => ({
            id: bs.service.id,
            name: bs.service.name,
            slug: bs.service.slug,
            price: Number(bs.service.price),
            duration: bs.service.duration,
        }));
    }
    return base;
}
function serializeBarberForAdmin(barber, includeServices = false) {
    const base = serializeBarber(barber, includeServices);
    base.barberType = barber.barberType ?? 'INTERNAL';
    base.location = barber.location ?? null;
    base.commissionType = barber.commissionType ?? 'PERCENTAGE';
    base.commissionValue = Number(barber.commissionValue ?? 0);
    base.portalEnabled = barber.portalEnabled ?? false;
    base.hasPortalPassword = Boolean(barber.passwordHash);
    return base;
}
async function attachReviewStats(items) {
    if (items.length === 0)
        return;
    const barberIds = items.map((item) => item.id);
    const reviews = await database_1.prisma.review.findMany({
        where: { status: 'APPROVED', barberId: { in: barberIds } },
        select: { barberId: true, rating: true },
    });
    const stats = new Map();
    for (const r of reviews) {
        if (!r.barberId)
            continue;
        const current = stats.get(r.barberId) ?? { count: 0, sum: 0 };
        current.count += 1;
        current.sum += r.rating;
        stats.set(r.barberId, current);
    }
    for (const item of items) {
        const stat = stats.get(item.id);
        item.reviewCount = stat ? stat.count : 0;
        item.reviewAverage = stat && stat.count > 0 ? Math.round((stat.sum / stat.count) * 10) / 10 : 0;
    }
}
async function uniqueSlug(name, excludeId) {
    const base = (0, slug_1.slugify)(name);
    let candidate = base;
    let counter = 2;
    while (true) {
        const existing = await database_1.prisma.barber.findFirst({
            where: excludeId
                ? { slug: candidate, id: { not: excludeId } }
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
    const passwordHash = portalPassword ? await hashPortalPassword(portalPassword) : null;
    const barber = await database_1.prisma.barber.create({
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
            barberType: data.barberType ?? 'INTERNAL',
            location: data.location ?? null,
            commissionType: data.commissionType ?? 'PERCENTAGE',
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
    });
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
    const where = {};
    if (!includeInactive) {
        where.isActive = true;
    }
    else if (query.isActive !== undefined) {
        where.isActive = query.isActive === 'true';
    }
    if (query.search) {
        const search = query.search;
        where.OR = [
            { name: { contains: search } },
            { slug: { contains: search } },
            { specialty: { contains: search } },
            { biography: { contains: search } },
        ];
    }
    if (query.barberType) {
        where.barberType = query.barberType;
    }
    if (query.location) {
        where.location = { contains: query.location };
    }
    if (query.serviceId) {
        where.barberServices = { some: { serviceId: query.serviceId } };
    }
    const availabilityFilter = query.availableToday === 'true' || query.availableToday === 'false';
    let rows;
    let count;
    if (availabilityFilter) {
        rows = await database_1.prisma.barber.findMany({
            where,
            include: { barberServices: { include: { service: true } } },
            orderBy: { name: 'asc' },
        });
        count = rows.length;
    }
    else {
        ;
        [rows, count] = await Promise.all([
            database_1.prisma.barber.findMany({
                where,
                include: { barberServices: { include: { service: true } } },
                orderBy: { name: 'asc' },
                skip: offset,
                take: limit,
            }),
            database_1.prisma.barber.count({ where }),
        ]);
    }
    const items = rows.map((barber) => options.adminView ? serializeBarberForAdmin(barber, true) : serializeBarber(barber, true));
    await attachReviewStats(items);
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
        const countGroups = await database_1.prisma.appointment.groupBy({
            by: ['barberId'],
            _count: { id: true },
        });
        const countMap = new Map();
        for (const g of countGroups) {
            countMap.set(g.barberId, g._count.id);
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
    const barber = await database_1.prisma.barber.findUnique({
        where: { id },
        include: { barberServices: { include: { service: true } } },
    });
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    const serialized = serializeBarber(barber, true);
    await attachReviewStats([serialized]);
    return serialized;
}
async function getBarberByIdForAdmin(id) {
    const barber = await database_1.prisma.barber.findUnique({
        where: { id },
        include: { barberServices: { include: { service: true } } },
    });
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    const serialized = serializeBarberForAdmin(barber, true);
    await attachReviewStats([serialized]);
    return serialized;
}
async function updateBarber(id, input) {
    const barber = await database_1.prisma.barber.findUnique({ where: { id } });
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    const { serviceIds, portalPassword, ...data } = input;
    let passwordHash = barber.passwordHash;
    if (portalPassword !== undefined) {
        passwordHash = portalPassword ? await hashPortalPassword(portalPassword) : null;
    }
    let slug = barber.slug;
    if (data.name && data.name !== barber.name) {
        slug = await uniqueSlug(data.name, id);
    }
    await database_1.prisma.$transaction(async (tx) => {
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
                ...(data.barberType !== undefined ? { barberType: data.barberType } : {}),
                ...(data.location !== undefined ? { location: data.location } : {}),
                ...(data.commissionType !== undefined ? { commissionType: data.commissionType } : {}),
                ...(data.commissionValue !== undefined ? { commissionValue: data.commissionValue } : {}),
                ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
                ...(data.portalEnabled !== undefined ? { portalEnabled: data.portalEnabled } : {}),
                ...(portalPassword !== undefined ? { passwordHash } : {}),
            },
        });
        if (serviceIds) {
            await tx.barberService.deleteMany({ where: { barberId: id } });
            if (serviceIds.length > 0) {
                await tx.barberService.createMany({
                    data: serviceIds.map((serviceId) => ({ barberId: id, serviceId })),
                });
            }
        }
    });
    let credentialNotice;
    if ((data.portalEnabled ?? barber.portalEnabled) && portalPassword) {
        const updated = await database_1.prisma.barber.findUnique({ where: { id } });
        if (updated) {
            credentialNotice = await sendPortalCredentialsEmail(updated, portalPassword);
        }
    }
    const fresh = await getBarberByIdForAdmin(id);
    return credentialNotice === undefined ? fresh : { ...fresh, credentialNotice };
}
async function deleteBarber(id) {
    const barber = await database_1.prisma.barber.findUnique({ where: { id } });
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    await database_1.prisma.$transaction([
        database_1.prisma.barberService.deleteMany({ where: { barberId: id } }),
        database_1.prisma.barberAvailability.deleteMany({ where: { barberId: id } }),
        database_1.prisma.barber.delete({ where: { id } }),
    ]);
}
async function deactivateBarber(id) {
    const barber = await database_1.prisma.barber.findUnique({ where: { id } });
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    await database_1.prisma.barber.update({
        where: { id },
        data: { isActive: false },
    });
}
async function countBarberAppointments(id) {
    return database_1.prisma.appointment.count({ where: { barberId: id } });
}
async function getBarberAvailability(barberId) {
    const barber = await database_1.prisma.barber.findUnique({ where: { id: barberId } });
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    return database_1.prisma.barberAvailability.findMany({
        where: { barberId },
        orderBy: { dayOfWeek: 'asc' },
    });
}
async function upsertBarberAvailability(barberId, entries) {
    const barber = await database_1.prisma.barber.findUnique({ where: { id: barberId } });
    if (!barber) {
        throw new errors_1.NotFoundError('Barber not found.');
    }
    await database_1.prisma.$transaction(entries.map((entry) => database_1.prisma.barberAvailability.upsert({
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
    })));
    return getBarberAvailability(barberId);
}
//# sourceMappingURL=barberService.js.map