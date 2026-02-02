import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

/**
 * Custom JSON body parser with error handling
 */
export const jsonBodyParser = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.method === 'GET' || req.method === 'DELETE') {
    return next()
  }

  let data = ''

  req.on('data', (chunk) => {
    data += chunk
  })

  req.on('end', () => {
    if (!data) {
      req.body = {}
      return next()
    }

    try {
      req.body = JSON.parse(data)
      next()
    } catch {
      return res.status(400).json({
        error: 'Invalid JSON in request body',
      })
    }
  })

  req.on('error', (error) => {
    console.error('Body parser error:', error)
    res.status(400).json({
      error: 'Failed to parse request body',
    })
  })
}

/**
 * Validator middleware factory
 * Validates request body against Zod schema
 */
export const validateBody = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.body)
      req.body = parsed
      next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }))
        return res.status(400).json({
          error: 'Validation error',
          details: formattedErrors,
        })
      }
      next(error)
    }
  }
}
