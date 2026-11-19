import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  public data?: Record<string, any>

  constructor(
    public statusCode: number,
    message: string,
    data?: Record<string, any>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.data = data
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

/**
 * SYN-255 — refusals the user can act on (4xx ApiError, validation, bad
 * token: "password not set", wrong password, no refresh token) are expected
 * traffic, not server failures. Logging them at ERROR filed a ticket per
 * refusal and drowned the real failures, so they go to WARN; everything else
 * (5xx ApiError, database outages, unknown errors) stays at ERROR. Same
 * approach SYN-253 took for fl-admin-portal's GraphQL API.
 */
export const logLevelForError = (error: unknown): 'warn' | 'error' => {
  if (error instanceof ApiError) {
    return error.statusCode >= 400 && error.statusCode < 500 ? 'warn' : 'error'
  }
  if (error instanceof z.ZodError) return 'warn'
  if (error instanceof Error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.message.includes('Invalid or expired token')
    ) {
      return 'warn'
    }
  }
  return 'error'
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

  // Log error with context for debugging. Expected refusals go to WARN and
  // carry no stack — it only ever points at the line that threw on purpose.
  if (logLevelForError(error) === 'warn') {
    console.warn(`[${requestId}] Refused:`, {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      statusCode: error instanceof ApiError ? error.statusCode : undefined,
      path: req.path,
      method: req.method,
    })
  } else {
    console.error(`[${requestId}] Error:`, {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path,
      method: req.method,
    })
  }

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
    const response: any = {
      error: error.message,
      statusCode: error.statusCode,
    }
    
    // Include additional data if present
    if (error.data) {
      Object.assign(response, error.data)
    }
    
    return res.status(error.statusCode).json(response)
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

    // Database connection errors (retriable)
    if (
      error.message &&
      (error.message.includes('ServiceUnavailable') ||
        error.message.includes('Connection was closed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('unavailable'))
    ) {
      return res.status(503).json({
        error: 'Database service temporarily unavailable',
        requestId,
      })
    }

    // Database not initialized
    if (error.message.includes('Database not initialized')) {
      return res.status(503).json({
        error: 'Service initializing, please retry',
        requestId,
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
