import { Op } from 'sequelize'
import { Review, type ReviewStatus } from '../models'
import { NotFoundError } from '../utils/errors'
import { getPagination } from '../utils/response'
import type { CreateReviewInput, UpdateReviewInput } from '../validators/review'
import type { Paged } from '../types'

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
  createdAt: Date
  updatedAt: Date
}

function serializeReview(review: Review): ReviewPublic {
  return {
    id: review.id,
    customerName: review.customerName,
    customerPhone: review.customerPhone ?? null,
    customerEmail: review.customerEmail ?? null,
    customerImage: review.customerImage,
    serviceId: review.serviceId ?? null,
    serviceName: review.serviceName ?? null,
    barberId: review.barberId ?? null,
    rating: Number(review.rating),
    comment: review.comment,
    status: review.status,
    isApproved: review.status === 'APPROVED',
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  }
}

export async function createReview(input: CreateReviewInput): Promise<ReviewPublic> {
  const review = await Review.create({
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

  const where: { [key: PropertyKey]: unknown } = {}
  if (query.status) {
    if (query.status !== 'all') where.status = query.status
  } else if (query.approved === 'true') {
    where.status = 'APPROVED'
  } else if (query.approved === 'false') {
    where.status = 'PENDING'
  }

  // Filter by barber when the validated `barberId` query param is present —
  // used by barber profiles to fetch only their own approved reviews.
  if (query.barberId) {
    where.barberId = query.barberId
  }

  if (query.search) {
    where[Op.or] = [
      { customerName: { [Op.like]: `%${query.search}%` } },
      { comment: { [Op.like]: `%${query.search}%` } },
      { customerPhone: { [Op.like]: `%${query.search}%` } },
      { customerEmail: { [Op.like]: `%${query.search}%` } },
      { serviceName: { [Op.like]: `%${query.search}%` } },
    ]
  }

  const { rows, count } = await Review.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset,
    limit,
  })

  return { items: rows.map(serializeReview), total: count, page, perPage }
}

export async function updateReview(id: number, input: UpdateReviewInput): Promise<ReviewPublic> {
  const review = await Review.findByPk(id)
  if (!review) {
    throw new NotFoundError('Review not found.')
  }

  const patch: Record<string, unknown> = { ...input }
  if (input.status !== undefined) {
    patch.isApproved = input.status === 'APPROVED'
  } else if (input.isApproved !== undefined) {
    patch.status = input.isApproved ? 'APPROVED' : 'PENDING'
  }

  await review.update(patch)
  return serializeReview(review)
}

export async function deleteReview(id: number): Promise<void> {
  const review = await Review.findByPk(id)
  if (!review) {
    throw new NotFoundError('Review not found.')
  }
  await review.destroy()
}

export async function approveReview(id: number): Promise<ReviewPublic> {
  const review = await Review.findByPk(id)
  if (!review) {
    throw new NotFoundError('Review not found.')
  }
  await review.update({ status: 'APPROVED', isApproved: true })
  return serializeReview(review)
}

export async function rejectReview(id: number): Promise<ReviewPublic> {
  const review = await Review.findByPk(id)
  if (!review) {
    throw new NotFoundError('Review not found.')
  }
  await review.update({ status: 'REJECTED', isApproved: false })
  return serializeReview(review)
}