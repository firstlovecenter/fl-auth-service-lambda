import { Request, Response } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { clearRefreshCookie } from '../utils/cookies'

/**
 * POST /auth/logout
 *
 * SYN-173: the refresh token now lives in an httpOnly cookie that page
 * JavaScript cannot clear, so logout must hit the server to drop it. Without
 * this, a client-side "logout" would leave the cookie intact and the next app
 * load could silently re-authenticate from it.
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  clearRefreshCookie(req, res)
  res.status(200).json({ message: 'Logged out successfully' })
})
