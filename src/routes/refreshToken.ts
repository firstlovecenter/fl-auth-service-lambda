import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { signJWT, verifyJWT } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import { ROLES_CLAIM, deriveRolesFromFlags } from '../utils/roles'
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
         {
           leadsBacenta:        exists((m)-[:LEADS]->(:Bacenta)),
           leadsGovernorship:   exists((m)-[:LEADS]->(:Governorship)),
           leadsCouncil:        exists((m)-[:LEADS]->(:Council)),
           leadsStream:         exists((m)-[:LEADS]->(:Stream)),
           leadsCampus:         exists((m)-[:LEADS]->(:Campus)),
           leadsOversight:      exists((m)-[:LEADS]->(:Oversight)),
           leadsDenomination:   exists((m)-[:LEADS]->(:Denomination)),
           isAdminForCampus:        exists((m)-[:IS_ADMIN_FOR]->(:Campus)),
           isAdminForGovernorship:  exists((m)-[:IS_ADMIN_FOR]->(:Governorship)),
           isAdminForCouncil:       exists((m)-[:IS_ADMIN_FOR]->(:Council)),
           isAdminForStream:        exists((m)-[:IS_ADMIN_FOR]->(:Stream)),
           isAdminForOversight:     exists((m)-[:IS_ADMIN_FOR]->(:Oversight)),
           isAdminForDenomination:  exists((m)-[:IS_ADMIN_FOR]->(:Denomination)),
           isArrivalsAdminForStream:        exists((m)-[:IS_ARRIVALS_ADMIN_FOR]->(:Stream)),
           isArrivalsAdminForCampus:       exists((m)-[:IS_ARRIVALS_ADMIN_FOR]->(:Campus)),
           isArrivalsAdminForCouncil:      exists((m)-[:IS_ARRIVALS_ADMIN_FOR]->(:Council)),
           isArrivalsAdminForGovernorship: exists((m)-[:IS_ARRIVALS_ADMIN_FOR]->(:Governorship)),
           isArrivalsCounterForStream:     exists((m)-[:IS_ARRIVALS_COUNTER_FOR]->(:Stream)),
           isArrivalsPayerCouncil:         exists((m)-[:IS_ARRIVALS_PAYER_FOR]->(:Council)),
           isTellerForStream:              exists((m)-[:IS_TELLER_FOR]->(:Stream)),
           isSheepSeekerForStream:         exists((m)-[:IS_SHEEP_SEEKER_FOR]->(:Stream))
         } AS flags
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
