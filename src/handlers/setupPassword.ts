import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { z } from 'zod'
import { initializeDB, getSession } from '../db/neo4j'
import {
  hashPassword,
  verifyJWT,
  signJWT,
  signRefreshToken,
} from '../utils/auth'
import { errorResponse, successResponse } from '../utils/response'
import { parseError, parseRequestBody } from '../utils/validation'

const setupPasswordSchema = z.object({
  setup_token: z.string().min(1, 'Setup token is required'),
  new_password: z.string().min(10, 'Password must be at least 10 characters'),
  confirm_password: z.string().min(1, 'Password confirmation is required'),
})

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  let session

  try {
    await initializeDB()

    // Parse request body
    const body = parseRequestBody(event.body)

    // Validate input
    const parseResult = setupPasswordSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse(parseError(parseResult.error), 400)
    }

    const { setup_token, new_password, confirm_password } = parseResult.data

    // Check passwords match
    if (new_password !== confirm_password) {
      return errorResponse('Passwords do not match', 400)
    }

    // Verify setup token
    let decoded: any
    try {
      decoded = verifyJWT(setup_token)
    } catch (error) {
      return errorResponse(
        'Invalid or expired setup link. Please try logging in again.',
        400,
      )
    }

    // Verify this is a setup token
    if (decoded.action !== 'password_setup') {
      return errorResponse('Invalid setup token', 400)
    }

    const { userId, email } = decoded

    session = getSession()

    // Begin transaction
    const tx = session.beginTransaction()

    try {
      // Hash new password
      const hashedPassword = await hashPassword(new_password)

      // Update user password (only if password is null)
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

      // Generate full access tokens
      const accessToken = signJWT({ userId, email: userEmail })
      const refreshToken = signRefreshToken({ userId, email: userEmail })

      return successResponse({
        message: 'Setup complete - welcome!',
        accessToken,
        refreshToken,
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
    console.error('Setup password error:', error)

    if (error instanceof Error) {
      if (error.message.includes('already migrated')) {
        return errorResponse(
          'This account has already been set up. Please login normally.',
          400,
        )
      }
      if (error.message.includes('not found')) {
        return errorResponse('Invalid setup link. User not found.', 404)
      }
    }

    return errorResponse(parseError(error), 500)
  } finally {
    if (session) {
      await session.close()
    }
  }
}
