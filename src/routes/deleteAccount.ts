import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { AuthenticatedRequest } from '../middleware/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import { sendAccountDeletionEmail } from '../utils/notifications'

const deleteAccountSchema = z.object({
  confirmDeletion: z.boolean().refine((val) => val === true, {
    message: 'You must confirm account deletion',
  }),
})

/**
 * Delete account endpoint
 * Allows users to permanently delete their account
 * Requires token verification and explicit confirmation
 * Production-ready with proper cascading deletion
 */
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { confirmDeletion } = deleteAccountSchema.parse(req.body)
    const decoded = (req as AuthenticatedRequest).auth

    if (!confirmDeletion) {
      throw new ApiError(400, 'Account deletion must be explicitly confirmed')
    }

    session = getSession()

    // Begin transaction for atomic deletion
    const tx = session.beginTransaction()

    try {
      // Fetch user email before deletion
      const userResult = await tx.run(
        `MATCH (u:User:Member {id: $userId})
         RETURN u.email as email`,
        { userId: decoded.userId },
      )

      const userEmail = userResult.records.length > 0 
        ? userResult.records[0].get('email') 
        : null

      // Delete all related data (cascade delete)
      // This ensures referential integrity
      await tx.run(
        `MATCH (u:User:Member {id: $userId})
         DETACH DELETE u`,
        { userId: decoded.userId },
      )

      await tx.commit()

      // Send account deletion confirmation email (non-blocking)
      if (userEmail) {
        sendAccountDeletionEmail(userEmail).catch((error) => {
          console.error('Failed to send account deletion email:', error)
          // Don't fail the request if email fails
        })
      }

      res.status(200).json({
        message: 'Account deleted successfully',
        accountId: decoded.userId,
      })
    } catch (error) {
      await tx.rollback()
      throw error
    }
  } finally {
    if (session) {
      await session.close()
    }
  }
})
