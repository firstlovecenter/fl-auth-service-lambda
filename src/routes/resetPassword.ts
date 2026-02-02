import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { verifyJWT, comparePassword, hashPassword } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import { sendPasswordResetEmail } from '../utils/notifications'
import type { JWTPayload } from '../types'

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
})

/**
 * Reset/Change password endpoint
 * Allows authenticated users to change their password
 * Production-ready with proper validation and error handling
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { email, currentPassword, newPassword, confirmPassword } =
      resetPasswordSchema.parse(req.body)

    if (newPassword !== confirmPassword) {
      throw new ApiError(400, 'New passwords do not match')
    }

    if (currentPassword === newPassword) {
      throw new ApiError(400, 'New password must be different from current password')
    }

    session = getSession()

    // Fetch user
    const userResult = await session.run(
      `MATCH (u:Member {email: $email})
       RETURN u.id as id, u.password as password, u.email as email`,
      { email },
    )

    if (userResult.records.length === 0) {
      throw new ApiError(401, 'Invalid email or password')
    }

    const userRecord = userResult.records[0]
    const userId = userRecord.get('id')
    const storedPassword = userRecord.get('password')

    // Verify current password
    const passwordMatch = await comparePassword(currentPassword, storedPassword)
    if (!passwordMatch) {
      throw new ApiError(401, 'Invalid email or password')
    }

    // Hash and update new password
    const hashedPassword = await hashPassword(newPassword)

    await session.run(
      `MATCH (u:Member {id: $userId})
       SET u.password = $password,
           u.updatedAt = datetime()
       RETURN u.id`,
      { userId, password: hashedPassword },
    )

    // Send password reset confirmation email (non-blocking)
    sendPasswordResetEmail(email).catch((error) => {
      console.error('Failed to send password reset email:', error)
      // Don't fail the request if email fails
    })

    res.status(200).json({
      message: 'Password updated successfully',
      user: {
        id: userId,
        email,
      },
    })
  } finally {
    if (session) {
      await session.close()
    }
  }
})
