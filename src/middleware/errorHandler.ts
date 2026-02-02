import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

/**
 * Global error handling middleware
 * Production-ready with proper logging and status codes
 */
export const errorHandler = (
  error: unknown,
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
) => {
  const requestId = (req.id as string) || 'unknown'

  // Log error with context for debugging
  console.error(`[${requestId}] Error:`, {
    name: error instanceof Error ? error.name : 'Unknown',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    path: req.path,
    method: req.method,
  })

  // Zod validation errors
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

  // Custom API errors
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      error: error.message,
    })
  }

  // JWT errors
  if (error instanceof Error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid or expired token',
      })
    }
    if (error.message.includes('Invalid or expired token')) {
      return res.status(401).json({
        error: 'Invalid or expired token',
      })
    }
  }

  // Default error
  res.status(500).json({
    error: 'Internal server error',
    requestId,
  })
}

/**
 * Async route wrapper to catch errors automatically
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
