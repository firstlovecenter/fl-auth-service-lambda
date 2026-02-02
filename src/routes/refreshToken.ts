import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { signJWT, verifyJWT } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import type { JWTPayload } from '../types'

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body)

    const decoded = verifyJWT(refreshToken) as JWTPayload

    session = getSession()

    const result = await session.run(
      `MATCH (u:Member {id: $userId}) 
       RETURN u.id as id, u.email as email`,
      { userId: decoded.userId },
    )

    if (result.records.length === 0) {
      throw new ApiError(404, 'User not found')
    }

    const record = result.records[0]
    const userId = record.get('id')
    const email = record.get('email')

    const newAccessToken = signJWT({ userId, email })

    res.status(200).json({
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
    })
  } finally {
    if (session) {
      await session.close()
    }
  }
})
