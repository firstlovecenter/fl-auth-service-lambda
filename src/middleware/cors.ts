import { Request, Response, NextFunction } from 'express'
import { getSecret } from '../utils/secrets'

/**
 * CORS middleware for Lambda
 * Allows requests from configured origins based on environment
 */
let allowedOrigins: Set<string> | null = null

/**
 * Initialize allowed origins based on environment
 */
const initializeAllowedOrigins = async (): Promise<Set<string>> => {
  if (allowedOrigins) {
    return allowedOrigins
  }

  const environment = await getSecret('ENVIRONMENT')
  const origins = [
    'http://localhost:3000',
    process.env.AMPLIFY_URL || '',
  ]

  // Add environment-specific origin
  if (environment === 'production') {
    origins.push('https://admin.firstlovecenter.com')
    origins.push('https://synago.firstlovecenter.com')
  } else if (environment === 'development') {
    origins.push('https://dev-synago.firstlovecenter.com')
  }

  allowedOrigins = new Set(origins.filter(Boolean))
  return allowedOrigins
}

export const corsMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const origins = await initializeAllowedOrigins()
    const origin = req.headers.origin

    if (origin && origins.has(origin)) {
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
  } catch (error) {
    next(error)
  }
}
