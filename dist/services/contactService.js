"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContactMessage = createContactMessage;
exports.listContactMessages = listContactMessages;
exports.getContactThread = getContactThread;
exports.markContactRead = markContactRead;
exports.updateContactStatus = updateContactStatus;
exports.deleteContactMessage = deleteContactMessage;
exports.sendContactReply = sendContactReply;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const response_1 = require("../utils/response");
const mailer_1 = require("./mailer");
function serializeReply(reply) {
    return {
        id: reply.id,
        contactMessageId: reply.contactMessageId,
        adminId: reply.adminId,
        adminName: reply.adminName,
        recipientEmail: reply.recipientEmail,
        subject: reply.subject,
        message: reply.message,
        status: reply.status,
        providerMessageId: reply.providerMessageId,
        sentAt: reply.sentAt,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
    };
}
function serializeMessage(message, replies = []) {
    const serializedReplies = replies
        .map(serializeReply)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return {
        id: message.id,
        name: message.name,
        phone: message.phone,
        email: message.email,
        subject: message.subject,
        message: message.message,
        isRead: message.isRead,
        status: message.status,
        repliedAt: message.repliedAt,
        archivedAt: message.archivedAt,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        replies: serializedReplies,
        replyCount: serializedReplies.length,
    };
}
async function createContactMessage(input) {
    const message = await database_1.prisma.contactMessage.create({
        data: {
            name: input.name,
            phone: input.phone ?? null,
            email: input.email,
            subject: input.subject ?? null,
            message: input.message,
            isRead: false,
            status: 'NEW',
        },
    });
    return serializeMessage(message);
}
async function listContactMessages(query) {
    const { page, perPage, offset, limit } = (0, response_1.getPagination)(query);
    const where = {};
    if (query.status && query.status !== 'all') {
        where.status = query.status;
    }
    else if (query.read === 'true') {
        where.isRead = true;
    }
    else if (query.read === 'false') {
        where.isRead = false;
    }
    const search = query.search?.trim();
    if (search) {
        where.OR = [
            { name: { contains: search } },
            { email: { contains: search } },
            { subject: { contains: search } },
            { message: { contains: search } },
        ];
    }
    const [rows, count] = await Promise.all([
        database_1.prisma.contactMessage.findMany({
            where,
            include: { replies: true },
            orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
            skip: offset,
            take: limit,
        }),
        database_1.prisma.contactMessage.count({ where }),
    ]);
    return {
        items: rows.map((row) => serializeMessage(row, row.replies ?? [])),
        total: count,
        page,
        perPage,
    };
}
async function getContactThread(id) {
    const message = await database_1.prisma.contactMessage.findUnique({
        where: { id },
        include: { replies: true },
    });
    if (!message) {
        throw new errors_1.NotFoundError('Contact message not found.');
    }
    return {
        ...serializeMessage(message, message.replies ?? []),
        emailConfigured: (0, mailer_1.isEmailConfigured)(),
    };
}
async function requireMessage(id) {
    const message = await database_1.prisma.contactMessage.findUnique({ where: { id } });
    if (!message) {
        throw new errors_1.NotFoundError('Contact message not found.');
    }
    return message;
}
async function markContactRead(id, isRead) {
    const message = await requireMessage(id);
    let updated;
    if (message.status === 'REPLIED' && isRead) {
        updated = message;
    }
    else if (message.status !== 'REPLIED' && message.status !== 'ARCHIVED') {
        updated = await database_1.prisma.contactMessage.update({
            where: { id },
            data: { isRead, status: isRead ? 'READ' : 'NEW' },
        });
    }
    else {
        updated = await database_1.prisma.contactMessage.update({
            where: { id },
            data: { isRead },
        });
    }
    return serializeMessage(updated, await getReplies(id));
}
async function updateContactStatus(id, status) {
    const message = await requireMessage(id);
    const updates = {
        status: status,
    };
    if (status === 'READ')
        updates.isRead = true;
    if (status === 'NEW')
        updates.isRead = false;
    if (status === 'ARCHIVED')
        updates.archivedAt = new Date();
    if (message.status === 'ARCHIVED' && status !== 'ARCHIVED')
        updates.archivedAt = null;
    const updated = await database_1.prisma.contactMessage.update({
        where: { id },
        data: updates,
    });
    return serializeMessage(updated, await getReplies(id));
}
async function deleteContactMessage(id) {
    await requireMessage(id);
    await database_1.prisma.contactMessage.delete({ where: { id } });
}
async function sendContactReply(input) {
    const contact = await requireMessage(input.contactMessageId);
    const trimmed = input.message.trim();
    if (trimmed.length < 2) {
        throw new errors_1.UnprocessableError('Reply message must be at least 2 characters.');
    }
    if (trimmed.length > 5000) {
        throw new errors_1.UnprocessableError('Reply message must be 5000 characters or fewer.');
    }
    const originalSubject = contact.subject?.trim() || 'Your message';
    const subject = `Re: ${originalSubject}`.slice(0, 250);
    const greetingName = contact.name.split(' ')[0] || 'there';
    const text = [
        `Hello ${greetingName},`,
        '',
        trimmed,
        '',
        '—',
        `${input.adminName}`,
        'SAWABA Grooming Studio',
        '',
        `In reply to your message: "${originalSubject}"`,
    ].join('\n');
    const html = [
        `<p>Hello ${escapeHtml(greetingName)},</p>`,
        `<p>${escapeHtml(trimmed).replace(/\n/g, '<br />')}</p>`,
        '<p style="margin-top:24px;">—<br /><strong>' + escapeHtml(input.adminName) + '</strong><br />SAWABA Grooming Studio</p>',
        `<p style="color:#888;font-size:12px;margin-top:24px;">In reply to your message: "${escapeHtml(originalSubject)}"</p>`,
    ].join('');
    if (!contact.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
        throw new errors_1.UnprocessableError('Invalid customer email address.');
    }
    let receipt;
    try {
        receipt = await (0, mailer_1.sendEmail)({
            to: contact.email,
            subject,
            text,
            html,
        });
    }
    catch (error) {
        await database_1.prisma.contactReply.create({
            data: {
                contactMessageId: contact.id,
                adminId: input.adminId,
                adminName: input.adminName,
                recipientEmail: contact.email,
                subject,
                message: trimmed,
                status: 'FAILED',
                sentAt: null,
            },
        });
        if (error instanceof mailer_1.EmailDeliveryError) {
            throw new errors_1.UnprocessableError(error.userMessage);
        }
        throw error;
    }
    const reply = await database_1.prisma.contactReply.create({
        data: {
            contactMessageId: contact.id,
            adminId: input.adminId,
            adminName: input.adminName,
            recipientEmail: contact.email,
            subject,
            message: trimmed,
            status: 'SENT',
            providerMessageId: receipt.messageId ? `${receipt.provider}:${receipt.messageId}` : null,
            sentAt: new Date(),
        },
    });
    const updatedContact = await database_1.prisma.contactMessage.update({
        where: { id: contact.id },
        data: { status: 'REPLIED', isRead: true, repliedAt: new Date() },
    });
    return {
        reply: serializeReply(reply),
        contact: serializeMessage(updatedContact, await getReplies(contact.id)),
        email: {
            messageId: receipt.messageId ?? null,
            accepted: receipt.accepted,
            rejected: receipt.rejected,
            response: receipt.response,
        },
    };
}
async function getReplies(contactMessageId) {
    return database_1.prisma.contactReply.findMany({
        where: { contactMessageId },
        orderBy: { createdAt: 'asc' },
    });
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
//# sourceMappingURL=contactService.js.map