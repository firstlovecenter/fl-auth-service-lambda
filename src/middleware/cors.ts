import { Request, Response, NextFunction } from 'express'

/**
 * CORS middleware for Lambda
 * Allows requests from any origin (suitable for API Gateway)
 */
export const corsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.header('Access-Control-Allow-Origin', '*')
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
