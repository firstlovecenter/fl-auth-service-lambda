import { Request, Response } from 'express'
import { z } from 'zod'
import { initializeDB, getSession } from '../db/neo4j'
import { hashPassword, verifyJWT, signJWT, signRefreshToken } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'

const setupPasswordSchema = z.object({
  setup_token: z.string().min(1, 'Setup token is required'),
  new_password: z.string().min(10, 'Password must be at least 10 characters'),
  confirm_password: z.string().min(1, 'Password confirmation is required'),
})

export const setupPassword = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    await initializeDB()

    const { setup_token, new_password, confirm_password } =
      setupPasswordSchema.parse(req.body)

    if (new_password !== confirm_password) {
      throw new ApiError(400, 'Passwords do not match')
    }

    let decoded: any
    try {
      decoded = verifyJWT(setup_token)
    } catch (error) {
      throw new ApiError(
        400,
        'Invalid or expired setup link. Please try logging in again.',
      )
    }

    if (decoded.action !== 'password_setup') {
      throw new ApiError(400, 'Invalid setup token')
    }

    const { userId, email } = decoded

    session = getSession()

    const tx = session.beginTransaction()

    try {
      const hashedPassword = await hashPassword(new_password)

      const result = await tx.run(
        `MATCH (u:Member {id: $userId, email: $email})
         WHERE u.password IS NULL
         SET u.password = $hashedPassword,
             u.migration_completed = true,
             u.lastLoginAt = datetime(),
             u.updatedAt = datetime()
         RETURN u.id as id, u.email as email, u.firstName as firstName, u.lastName as lastName`,
        {
          userId,
          email,
          hashedPassword,
        },
      )

      if (result.records.length === 0) {
        throw new Error('Setup invalid - account already migrated or not found')
      }

      await tx.commit()

      const record = result.records[0]
      const userEmail = record.get('email')
      const firstName = record.get('firstName')
      const lastName = record.get('lastName')

      const accessToken = await signJWT({ userId, email: userEmail })
      const newRefreshToken = await signRefreshToken({ userId, email: userEmail })

      res.status(200).json({
        message: 'Setup complete - welcome!',
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: userId,
          email: userEmail,
          firstName,
          lastName,
        },
      })
    } catch (error) {
      await tx.rollback()
      throw error
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('already migrated')) {
        throw new ApiError(
          400,
          'This account has already been set up. Please login normally.',
        )
      }
      if (error.message.includes('not found')) {
        throw new ApiError(404, 'Invalid setup link. User not found.')
      }
    }
    throw error
  } finally {
    if (session) {
      await session.close()
    }
  }
})
