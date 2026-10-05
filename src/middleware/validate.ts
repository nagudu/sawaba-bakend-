import type { NextFunction, Request, Response } from 'express'
import { ZodError, type ZodTypeAny } from 'zod'

type RequestPart = 'body' | 'query' | 'params'

/**
 * Middleware that validates a request part against a Zod schema.
 * Attaches the parsed value back onto the request so the handler
 * only ever receives trusted, normalized data.
 */
export function validate<T extends ZodTypeAny>(schema: T, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part])
    if (result.success) {
      ;(req as unknown as Record<string, unknown>)[part] = result.data
      next()
      return
    }
    next(result.error)
  }
}

export { ZodError }