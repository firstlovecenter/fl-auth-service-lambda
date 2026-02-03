import { Request, Response, NextFunction } from 'express'

/**
 * CORS middleware for Lambda
 * Allows requests from any origin (suitable for API Gateway)
 */
const allowedOrigins = new Set(['http://localhost:3000'])

export const corsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const origin = req.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  }
  res.header('Vary', 'Origin')
  res.header('Access-Control-Allow-Credentials', 'true')
  res.header(
    'Access-Control-Allow-Methods',
    'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  )
  res.header(
    'Access-Control-Allow-Headers',
    'Origin,X-Requested-With,Content-Type,Accept,Authorization',
  )

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }

  next()
}
