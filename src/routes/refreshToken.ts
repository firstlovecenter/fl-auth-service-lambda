import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { signJWT, verifyJWT } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import { ROLES_CLAIM, deriveRolesFromFlags } from '../utils/roles'
import { MEMBER_FLAGS_QUERY } from '../utils/queries'
import type { JWTPayload } from '../types'

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

export const refreshToken = asyncHandler(
  async (req: Request, res: Response) => {
    let session

    try {
      const { refreshToken } = refreshTokenSchema.parse(req.body)

      const decoded = (await verifyJWT(refreshToken)) as JWTPayload

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

      const newAccessToken = await signJWT(
        {
          userId: member.id,
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          [ROLES_CLAIM]: roles,
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
