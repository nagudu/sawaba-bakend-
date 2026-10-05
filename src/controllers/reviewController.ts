import type { Request, Response, NextFunction } from 'express'
import {
  createReview,
  listReviews,
  updateReview,
  deleteReview,
} from '../services/reviewService'
import { successRes } from '../utils/response'
import type { CreateReviewInput, UpdateReviewInput } from '../validators/review'

export async function createReviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CreateReviewInput
    const review = await createReview(input)
    successRes(
      res,
      'Thank you for your review! Your feedback has been submitted successfully and is awaiting approval.',
      review,
      201,
    )
  } catch (error) {
    next(error)
  }
}

export async function listReviewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as Record<string, unknown>
    const result = await listReviews(query)
    successRes(res, 'Reviews retrieved.', result, 200)
  } catch (error) {
    next(error)
  }
}

export async function updateReviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as UpdateReviewInput
    const review = await updateReview(Number(req.params.id), input)
    successRes(res, 'Review updated successfully.', review, 200)
  } catch (error) {
    next(error)
  }
}

export async function deleteReviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteReview(Number(req.params.id))
    successRes(res, 'Review deleted successfully.', {}, 200)
  } catch (error) {
    next(error)
  }
}