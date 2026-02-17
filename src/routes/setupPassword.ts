import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { hashPassword, verifyJWT } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'

const setupPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const setupPassword = asyncHandler(
  async (req: Request, res: Response) => {
    let session

    try {
      const { email, token, password } = setupPasswordSchema.parse(req.body)

      let decoded: any
      try {
        decoded = await verifyJWT(token)
      } catch (error) {
        console.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message: 'JWT verification failed',
            error: error instanceof Error ? error.message : String(error),
            token: token.substring(0, 20) + '...', // Log first 20 chars for debugging
          }),
        )
        throw new ApiError(
          401,
          'Invalid or expired setup link. Please try logging in again.',
        )
      }

      const { userId, action } = decoded

      session = getSession()

      const hashedPassword = await hashPassword(password)

      // For password reset, allow overwriting existing password
      // For first-time setup, only allow if password is NULL
      const isPasswordReset = action === 'password_reset'

      const result = await session.run(
        isPasswordReset
          ? `MATCH (u:User:Member {id: $userId, email: $email})
             SET u.password = $hashedPassword,
                 u.updatedAt = datetime()
             RETURN u.id as id, u.email as email, u.firstName as firstName, u.lastName as lastName`
          : `MATCH (u:User:Member {id: $userId, email: $email})
             WHERE u.password IS NULL
             SET u.password = $hashedPassword,
                 u.updatedAt = datetime()
             RETURN u.id as id, u.email as email, u.firstName as firstName, u.lastName as lastName`,
        {
          userId,
          email,
          hashedPassword,
        },
      )

      if (result.records.length === 0) {
        throw new ApiError(
          404,
          isPasswordReset
            ? 'User not found'
            : 'User not found or password already set',
        )
      }

      const record = result.records[0]

      res.status(200).json({
        message: 'Password set up successfully',
        user: {
          id: record.get('id'),
          email: record.get('email'),
        },
      })
    } finally {
      if (session) {
        await session.close()
      }
    }
  },
)
