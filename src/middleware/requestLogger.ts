import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

/**
 * Request ID middleware for tracing
 * Adds unique ID to each request for debugging and logging
 */
export const requestIdMiddleware = (
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
) => {
  const headerValue = req.headers['x-request-id']
  req.id = (Array.isArray(headerValue) ? headerValue[0] : headerValue) || randomUUID()
  res.setHeader('x-request-id', req.id)
  next()
}

/**
 * Request logging middleware
 * Logs incoming requests and response times (production-ready)
 */
export const requestLogger = (
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
) => {
  const startTime = Date.now()
  const originalSend = res.send

  res.send = function (data: any) {
    const duration = Date.now() - startTime

    console.log({
      timestamp: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    })

    return originalSend.call(this, data)
  }

  next()
}
