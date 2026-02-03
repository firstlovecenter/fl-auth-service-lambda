import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { signJWT, verifyJWT } from '../utils/auth'
import { errorResponse, successResponse } from '../utils/response'
import { parseError, parseRequestBody } from '../utils/validation'
import { JWTPayload } from '../types'

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  let session

  try {
    // Parse request body
    const body = parseRequestBody(event.body)

    // Validate input
    const parseResult = refreshTokenSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse(parseError(parseResult.error), 400)
    }

    const { refreshToken } = parseResult.data

    // Verify refresh token
    const decoded = (await verifyJWT(refreshToken)) as JWTPayload

    session = getSession()

    // Check if user exists
    const result = await session.run(
        `MATCH (u:User {id: $userId}) 
       RETURN u.id as id, u.email as email`,
      { userId: decoded.userId },
    )

    if (result.records.length === 0) {
      return errorResponse('User not found', 404)
    }

    const record = result.records[0]
    const userId = record.get('id')
    const email = record.get('email')

    // Generate new access token
    const newAccessToken = signJWT({ userId, email })

    return successResponse({
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
    })
  } catch (error) {
    console.error('Refresh token error:', error)

    // Special handling for JWT errors
    if (error instanceof Error && error.message.includes('token')) {
      return errorResponse('Invalid or expired refresh token', 401)
    }

    return errorResponse(parseError(error), 500)
  } finally {
    if (session) {
      await session.close()
    }
  }
}
