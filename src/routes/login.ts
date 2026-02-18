import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { comparePassword, signJWT, signRefreshToken } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import { ROLES_CLAIM, deriveRolesFromFlags } from '../utils/roles'
import { MEMBER_FLAGS_QUERY } from '../utils/queries'

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
       RETURN
         m { .id, .firstName, .lastName, .email, .password } AS member,
         ${MEMBER_FLAGS_QUERY}
       LIMIT 1`,
      { email, id: null },
    )

    if (result.records.length === 0) {
      throw new ApiError(401, 'Invalid email or password')
    }

    const record = result.records[0]
    const member = record.get('member')
    const flags = record.get('flags')

    // Check if password is NULL (user needs to set up password)
    if (member.password === null || member.password === undefined) {
      throw new ApiError(
        401,
        "Password not set. Please use 'Forgot Password' to set up your password.",
        { requiresPasswordSetup: true },
      )
    }

    const passwordMatch = await comparePassword(password, member.password)
    if (!passwordMatch) {
      throw new ApiError(401, 'Invalid email or password')
    }

    const roles = deriveRolesFromFlags(flags)

    // Generate tokens
    const accessToken = await signJWT(
      {
        userId: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        [ROLES_CLAIM]: roles,
      },
      '30m',
    )

    const refreshToken = await signRefreshToken({
      userId: member.id,
      email: member.email,
    })

    res.status(200).json({
      message: 'Login successful',
      tokens: {
        accessToken,
        refreshToken,
      },
      user: {
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        roles,
      },
    })
  } finally {
    if (session) {
      await session.close()
    }
  }
})
