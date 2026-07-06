import { Request, Response } from 'express'
import { getSession } from '../db/neo4j'
import { signJWT, verifyJWT } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import {
  ROLES_CLAIM,
  deriveRolesFromFlags,
  extractChurchScopes,
} from '../utils/roles'
import { MEMBER_FLAGS_QUERY } from '../utils/queries'
import { readRefreshCookie } from '../utils/cookies'
import type { JWTPayload } from '../types'

// SYN-173/188: the refresh token is read solely from the httpOnly cookie. It is
// never accepted from the request body — the cookie is the sole transport.
export const refreshToken = asyncHandler(
  async (req: Request, res: Response) => {
    let session

    try {
      const token = readRefreshCookie(req)

      if (!token) {
        throw new ApiError(401, 'No refresh token provided')
      }

      // A rejected/expired cookie must surface as 401 (not 500) — the web
      // client only clears the session and shows login on a 401 (SYN-173).
      let decoded: JWTPayload
      try {
        decoded = (await verifyJWT(token)) as JWTPayload
      } catch {
        throw new ApiError(401, 'Invalid or expired refresh token')
      }

      session = getSession()

      const result = await session.run(
        `MATCH (m:User:Member {id: $userId})
       RETURN
         m { .id, .firstName, .lastName, .email } AS member,
         ${MEMBER_FLAGS_QUERY}
       LIMIT 1`,
        { userId: decoded.userId },
      )

      if (result.records.length === 0) {
        throw new ApiError(404, 'User not found')
      }

      const record = result.records[0]
      const member = record.get('member')
      const flags = record.get('flags')

      const roles = deriveRolesFromFlags(flags)
      const churchScopes = extractChurchScopes(flags)

      const newAccessToken = await signJWT(
        {
          userId: member.id,
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          [ROLES_CLAIM]: roles,
          churchScopes,
        },
        '30m',
      )

      res.status(200).json({
        message: 'Token refreshed successfully',
        accessToken: newAccessToken,
      })
    } finally {
      if (session) {
        await session.close()
      }
    }
  },
)
