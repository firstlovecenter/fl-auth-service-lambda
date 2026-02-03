import { Request, Response } from 'express'
import { z } from 'zod'
import { initializeDB, getSession } from '../db/neo4j'
import { hashPassword, verifyJWT, signJWT, signRefreshToken } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'

const setupPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const setupPassword = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    await initializeDB()

    const { email, token, password } =
      setupPasswordSchema.parse(req.body)

    let decoded: any
    try {
      decoded = await verifyJWT(token)
    } catch (error) {
      throw new ApiError(
        401,
        'Invalid or expired setup link. Please try logging in again.',
      )
    }

    const { userId } = decoded

    session = getSession()

    const hashedPassword = await hashPassword(password)

    const result = await session.run(
      `MATCH (u:User {id: $userId, email: $email})
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
      throw new ApiError(404, 'User not found or password already set')
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
})
