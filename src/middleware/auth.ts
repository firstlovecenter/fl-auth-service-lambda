import { Request, Response, NextFunction } from 'express'
import { verifyJWT } from '../utils/auth'
import { asyncHandler, ApiError } from './errorHandler'
import type { JWTPayload } from '../types'

export interface AuthenticatedRequest extends Request {
  auth: JWTPayload
}

const extractBearerToken = (authorizationHeader?: string): string => {
  if (!authorizationHeader) {
    throw new ApiError(401, 'Authorization header is required')
  }

  const [scheme, token] = authorizationHeader.split(' ')

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Authorization header must be in Bearer token format')
  }

  return token
}

export const requireBearerAuth = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization)
    const decoded = (await verifyJWT(token)) as JWTPayload

    if (!decoded.userId) {
      throw new ApiError(401, 'Invalid or expired token')
    }

    ;(req as AuthenticatedRequest).auth = {
      userId: String(decoded.userId),
      email: decoded.email,
      iat: decoded.iat,
      exp: decoded.exp,
    }

    next()
  },
)
