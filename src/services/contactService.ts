import { Op, type WhereOptions } from 'sequelize'
import { ContactMessage, ContactReply } from '../models'
import { NotFoundError, UnprocessableError } from '../utils/errors'
import { getPagination } from '../utils/response'
import type { CreateContactInput } from '../validators/contact'
import type { Paged } from '../types'
import { EmailDeliveryError, isEmailConfigured, sendEmail, type EmailSendReceipt } from './mailer'

export type ContactStatus = 'NEW' | 'READ' | 'REPLIED' | 'ARCHIVED'

export interface ContactReplyPublic {
  id: number
  contactMessageId: number
  adminId: number | null
  adminName: string | null
  recipientEmail: string
  subject: string
  message: string
  status: 'SENT' | 'FAILED'
  providerMessageId: string | null
  sentAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ContactPublic {
  id: number
  name: string
  phone: string | null
  email: string
  subject: string | null
  message: string
  isRead: boolean
  status: ContactStatus
  repliedAt: Date | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  replies: ContactReplyPublic[]
  replyCount: number
}

export interface ContactThreadPublic extends ContactPublic {
  emailConfigured: boolean
}

function serializeReply(reply: ContactReply): ContactReplyPublic {
  return {
    id: reply.id,
    contactMessageId: reply.contactMessageId,
    adminId: reply.adminId,
    adminName: reply.adminName,
    recipientEmail: reply.recipientEmail,
    subject: reply.subject,
    message: reply.message,
    status: reply.status as ContactReplyPublic['status'],
    providerMessageId: reply.providerMessageId,
    sentAt: reply.sentAt,
    createdAt: reply.createdAt,
    updatedAt: reply.updatedAt,
  }
}

function serializeMessage(message: ContactMessage, replies: ContactReply[] = []): ContactPublic {
  const serializedReplies = replies
    .map(serializeReply)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
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
  }
}

export async function createContactMessage(input: CreateContactInput): Promise<ContactPublic> {
  const message = await ContactMessage.create({
    name: input.name,
    phone: input.phone ?? null,
    email: input.email,
    subject: input.subject ?? null,
    message: input.message,
    isRead: false,
    status: 'NEW',
  })
  return serializeMessage(message)
}

export interface ListContactQuery {
  read?: string
  status?: string
  search?: string
  page?: number
  perPage?: number
}

const SEARCH_FIELDS = ['name', 'email', 'subject', 'message'] as const

export async function listContactMessages(query: ListContactQuery): Promise<Paged<ContactPublic>> {
  const { page, perPage, offset, limit } = getPagination(query as unknown as Record<string, unknown>)

  const where: WhereOptions<ContactMessage> = {}

  if (query.status && query.status !== 'all') {
    where.status = query.status
  } else if (query.read === 'true') {
    where.isRead = true
  } else if (query.read === 'false') {
    where.isRead = false
  }

  const search = query.search?.trim()
  if (search) {
    Object.assign(where, {
      [Op.or]: SEARCH_FIELDS.map((field) => ({
        [field]: { [Op.like]: `%${search}%` },
      })),
    })
  }

  const { rows, count } = await ContactMessage.findAndCountAll({
    where,
    distinct: true,
    order: [
      ['isRead', 'ASC'],
      ['createdAt', 'DESC'],
    ],
    include: [{ model: ContactReply, as: 'replies' }],
    offset,
    limit,
  })

  return {
    items: rows.map((row) => serializeMessage(row, (row as unknown as { replies?: ContactReply[] }).replies ?? [])),
    total: count,
    page,
    perPage,
  }
}

export async function getContactThread(id: number): Promise<ContactThreadPublic> {
  const message = await ContactMessage.findByPk(id, {
    include: [{ model: ContactReply, as: 'replies' }],
  })
  if (!message) {
    throw new NotFoundError('Contact message not found.')
  }
  return {
    ...serializeMessage(message, (message as unknown as { replies?: ContactReply[] }).replies ?? []),
    emailConfigured: isEmailConfigured(),
  }
}

async function requireMessage(id: number): Promise<ContactMessage> {
  const message = await ContactMessage.findByPk(id)
  if (!message) {
    throw new NotFoundError('Contact message not found.')
  }
  return message
}

export async function markContactRead(id: number, isRead: boolean): Promise<ContactPublic> {
  const message = await requireMessage(id)
  if (message.status === 'REPLIED' && isRead) {
    return serializeMessage(message, await getReplies(id))
  }
  if (message.status !== 'REPLIED' && message.status !== 'ARCHIVED') {
    await message.update({ isRead, status: isRead ? 'READ' : 'NEW' })
  } else {
    await message.update({ isRead })
  }
  return serializeMessage(message, await getReplies(id))
}

export async function updateContactStatus(id: number, status: ContactStatus): Promise<ContactPublic> {
  const message = await requireMessage(id)
  const updates: Partial<{ status: ContactStatus; isRead: boolean; archivedAt: Date | null }> = { status }
  if (status === 'READ') updates.isRead = true
  if (status === 'NEW') updates.isRead = false
  if (status === 'ARCHIVED') updates.archivedAt = new Date()
  if (message.status === 'ARCHIVED' && status !== 'ARCHIVED') updates.archivedAt = null
  await message.update(updates)
  return serializeMessage(message, await getReplies(id))
}

export async function deleteContactMessage(id: number): Promise<void> {
  const message = await requireMessage(id)
  await message.destroy()
}

export interface SendContactReplyInput {
  contactMessageId: number
  adminId: number
  adminName: string
  message: string
}

export async function sendContactReply(input: SendContactReplyInput): Promise<{
  reply: ContactReplyPublic
  contact: ContactPublic
  email: { messageId: string | null; accepted: string[]; rejected: string[]; response: string }
}> {
  const contact = await requireMessage(input.contactMessageId)

  const trimmed = input.message.trim()
  if (trimmed.length < 2) {
    throw new UnprocessableError('Reply message must be at least 2 characters.')
  }
  if (trimmed.length > 5000) {
    throw new UnprocessableError('Reply message must be 5000 characters or fewer.')
  }

  const originalSubject = contact.subject?.trim() || 'Your message'
  const subject = `Re: ${originalSubject}`.slice(0, 250)
  const greetingName = contact.name.split(' ')[0] || 'there'

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
  ].join('\n')

  const html = [
    `<p>Hello ${escapeHtml(greetingName)},</p>`,
    `<p>${escapeHtml(trimmed).replace(/\n/g, '<br />')}</p>`,
    '<p style="margin-top:24px;">—<br /><strong>' + escapeHtml(input.adminName) + '</strong><br />SAWABA Grooming Studio</p>',
    `<p style="color:#888;font-size:12px;margin-top:24px;">In reply to your message: "${escapeHtml(originalSubject)}"</p>`,
  ].join('')

  if (!contact.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    throw new UnprocessableError('Invalid customer email address.')
  }

  // Send FIRST, and only persist a SENT record / flip the message to REPLIED once the
  // email provider has actually accepted the message. Failures are recorded as FAILED
  // attempts (visible in the thread) and the message keeps its previous status.
  let receipt: EmailSendReceipt
  try {
    receipt = await sendEmail({
      to: contact.email,
      subject,
      text,
      html,
    })
  } catch (error) {
    await ContactReply.create({
      contactMessageId: contact.id,
      adminId: input.adminId,
      adminName: input.adminName,
      recipientEmail: contact.email,
      subject,
      message: trimmed,
      status: 'FAILED',
      sentAt: null,
    })
    if (error instanceof EmailDeliveryError) {
      throw new UnprocessableError(error.userMessage)
    }
    throw error
  }

  const reply = await ContactReply.create({
    contactMessageId: contact.id,
    adminId: input.adminId,
    adminName: input.adminName,
    recipientEmail: contact.email,
    subject,
    message: trimmed,
    status: 'SENT',
    providerMessageId: receipt.messageId ? `${receipt.provider}:${receipt.messageId}` : null,
    sentAt: new Date(),
  })

  await contact.update({ status: 'REPLIED', isRead: true, repliedAt: new Date() })

  return {
    reply: serializeReply(reply),
    contact: serializeMessage(contact, await getReplies(contact.id)),
    email: {
      messageId: receipt.messageId ?? null,
      accepted: receipt.accepted,
      rejected: receipt.rejected,
      response: receipt.response,
    },
  }
}

async function getReplies(contactMessageId: number): Promise<ContactReply[]> {
  return ContactReply.findAll({
    where: { contactMessageId },
    order: [['createdAt', 'ASC']],
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
