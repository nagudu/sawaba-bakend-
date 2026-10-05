import { prisma } from '../config/database'
import type { Prisma, Review as ReviewModel, ReviewStatus as PrismaReviewStatus } from '@prisma/client'
import { NotFoundError } from '../utils/errors'
import { getPagination } from '../utils/response'
import type { CreateReviewInput, UpdateReviewInput } from '../validators/review'
import type { Paged, ReviewStatus } from '../types'

export interface ReviewPublic {
  id: number
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  customerImage: string | null
  serviceId: number | null
  serviceName: string | null
  barberId: number | null
  rating: number
  comment: string
  status: ReviewStatus
  isApproved: boolean
  createdAt: Date | null
  updatedAt: Date | null
}

function serializeReview(review: ReviewModel): ReviewPublic {
  return {
    id: review.id,
    customerName: review.customerName,
    customerPhone: review.customerPhone ?? null,
    customerEmail: review.customerEmail ?? null,
    customerImage: review.customerImage,
    serviceId: review.serviceId ?? null,
    serviceName: review.serviceName ?? null,
    barberId: review.barberId ?? null,
    rating: review.rating,
    comment: review.comment,
    status: review.status as ReviewStatus,
    isApproved: review.status === 'APPROVED',
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  }
}

export async function createReview(input: CreateReviewInput): Promise<ReviewPublic> {
  const review = await prisma.review.create({
    data: {
      customerName: input.customerName,
      customerPhone: input.customerPhone ?? null,
      customerEmail: input.customerEmail ?? null,
      customerImage: input.customerImage ?? null,
      serviceId: input.serviceId ?? null,
      serviceName: input.serviceName ?? null,
      barberId: input.barberId ?? null,
      rating: input.rating,
      comment: input.comment,
      status: 'PENDING',
      isApproved: false,
    },
  })
  return serializeReview(review)
}

export async function listReviews(query: {
  approved?: string
  status?: string
  search?: string
  barberId?: number
  page?: number
  perPage?: number
}): Promise<Paged<ReviewPublic>> {
  const { page, perPage, offset, limit } = getPagination(query)
  const where: Prisma.ReviewWhereInput = {}

  if (query.status) {
    if (query.status !== 'all') where.status = query.status as PrismaReviewStatus
  } else if (query.approved === 'true') {
    where.status = 'APPROVED'
  } else if (query.approved === 'false') {
    where.status = 'PENDING'
  }

  if (query.barberId) {
    where.barberId = query.barberId
  }

  if (query.search) {
    where.OR = [
      { customerName: { contains: query.search } },
      { comment: { contains: query.search } },
      { customerPhone: { contains: query.search } },
      { customerEmail: { contains: query.search } },
      { serviceName: { contains: query.search } },
    ]
  }

  const [rows, total] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.review.count({ where }),
  ])

  return { items: rows.map(serializeReview), total, page, perPage }
}

export async function updateReview(id: number, input: UpdateReviewInput): Promise<ReviewPublic> {
  const existing = await prisma.review.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    throw new NotFoundError('Review not found.')
  }

  const patch: Prisma.ReviewUpdateInput = { ...input }
  if (input.status !== undefined) {
    patch.status = input.status as PrismaReviewStatus
    patch.isApproved = input.status === 'APPROVED'
  } else if (input.isApproved !== undefined) {
    patch.status = input.isApproved ? 'APPROVED' : 'PENDING'
    patch.isApproved = input.isApproved
  }

  const updated = await prisma.review.update({ where: { id }, data: patch })
  return serializeReview(updated)
}

export async function deleteReview(id: number): Promise<void> {
  const existing = await prisma.review.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    throw new NotFoundError('Review not found.')
  }
  await prisma.review.delete({ where: { id } })
}

export async function approveReview(id: number): Promise<ReviewPublic> {
  const existing = await prisma.review.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    throw new NotFoundError('Review not found.')
  }
  const updated = await prisma.review.update({
    where: { id },
    data: { status: 'APPROVED', isApproved: true },
  })
  return serializeReview(updated)
}

export async function rejectReview(id: number): Promise<ReviewPublic> {
  const existing = await prisma.review.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    throw new NotFoundError('Review not found.')
  }
  const updated = await prisma.review.update({
    where: { id },
    data: { status: 'REJECTED', isApproved: false },
  })
  return serializeReview(updated)
}
