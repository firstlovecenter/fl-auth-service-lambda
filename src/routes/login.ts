import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { signJWT, signRefreshToken } from '../utils/auth'
import { verifyMemberPassword } from '../utils/authenticate'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import {
  ROLES_CLAIM,
  deriveRolesFromFlags,
  extractChurchScopes,
} from '../utils/roles'
import { MEMBER_FLAGS_QUERY, MEMBER_MEMBERSHIP_CALL } from '../utils/queries'
import { setRefreshCookie } from '../utils/cookies'
import { MembershipInfo } from '../types'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const login = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { email, password } = loginSchema.parse(req.body)

    session = getSession()

    const result = await session.run(
      `MATCH (m:User:Member)
       WHERE ($email IS NOT NULL AND m.email = $email)
          OR ($id IS NOT NULL AND m.id = $id)
       WITH m LIMIT 1
       ${MEMBER_MEMBERSHIP_CALL}
       RETURN
         m { .id, .firstName, .lastName, .email, .password } AS member,
         ${MEMBER_FLAGS_QUERY},
         membership`,
      { email, id: null },
    )

    if (result.records.length === 0) {
      throw new ApiError(401, 'Invalid email or password')
    }

    const record = result.records[0]
    const member = record.get('member')
    const flags = record.get('flags')
    const membership: MembershipInfo = record.get('membership')

    // SYN: shared with the external-SSO login (utils/authenticate.ts) so both
    // apply the exact same NULL-password / bcrypt-compare / error semantics.
    await verifyMemberPassword(member.password, password)

    const roles = deriveRolesFromFlags(flags)
    const churchScopes = extractChurchScopes(flags)

    // Generate tokens
    const accessToken = await signJWT(
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

    const refreshToken = await signRefreshToken({
      userId: member.id,
      email: member.email,
    })

    // SYN-173/188: the refresh token is delivered solely as an httpOnly, Secure
    // cookie so page JavaScript can never read it. It is never returned in the
    // response body — the cookie is the sole transport.
    setRefreshCookie(req, res, refreshToken)

    res.status(200).json({
      message: 'Login successful',
      tokens: {
        accessToken,
      },
      user: {
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        roles,
      },
      membership,
    })
  } finally {
    if (session) {
      await session.close()
    }
  }
})
