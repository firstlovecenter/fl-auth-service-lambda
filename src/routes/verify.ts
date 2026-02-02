import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { verifyJWT } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import type { JWTPayload } from '../types'

const verifySchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

export const verify = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { token } = verifySchema.parse(req.body)

    const decoded = verifyJWT(token) as JWTPayload

    session = getSession()

    const result = await session.run(
      `MATCH (u:Member {id: $userId}) 
       RETURN u.id as id, u.email as email, u.firstName as firstName, u.lastName as lastName`,
      { userId: decoded.userId },
    )

    if (result.records.length === 0) {
      throw new ApiError(404, 'User not found')
    }

    const record = result.records[0]

    res.status(200).json({
      valid: true,
      user: {
        id: record.get('id'),
        email: record.get('email'),
        firstName: record.get('firstName'),
        lastName: record.get('lastName'),
      },
    })
  } finally {
    if (session) {
      await session.close()
    }
  }
})
