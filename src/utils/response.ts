import type { Response } from 'express'

export function successRes<T>(res: Response, message: string, data: T, status = 200): void {
  res.status(status).json({ success: true, message, data })
}

export function errorRes(res: Response, message: string, status = 400): void {
  res.status(status).json({ success: false, message })
}

export function getPagination(query: Record<string, unknown>): { page: number; perPage: number; offset: number; limit: number } {
  const page = Math.max(1, Number(query.page) || 1)
  const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 20))
  return { page, perPage, offset: (page - 1) * perPage, limit: perPage }
}