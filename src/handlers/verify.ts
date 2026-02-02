import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { verifyJWT } from '../utils/auth'
import { errorResponse, successResponse } from '../utils/response'
import { parseError, parseRequestBody } from '../utils/validation'
import { JWTPayload } from '../types'

const verifySchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  let session

  try {
    // Parse request body
    const body = parseRequestBody(event.body)

    // Validate input
    const parseResult = verifySchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse(parseError(parseResult.error), 400)
    }

    const { token } = parseResult.data

    // Verify token
    const decoded = (await verifyJWT(token)) as JWTPayload

    session = getSession()

    // Check if user exists
    const result = await session.run(
      `MATCH (u:Member {id: $userId}) 
       RETURN u.id as id, u.email as email, u.firstName as firstName, u.lastName as lastName`,
      { userId: decoded.userId },
    )

    if (result.records.length === 0) {
      return errorResponse('User not found', 404)
    }

    const record = result.records[0]

    return successResponse({
      valid: true,
      user: {
        id: record.get('id'),
        email: record.get('email'),
        firstName: record.get('firstName'),
        lastName: record.get('lastName'),
      },
    })
  } catch (error) {
    console.error('Verify error:', error)

    // Special handling for JWT errors
    if (error instanceof Error && error.message.includes('token')) {
      return errorResponse('Invalid or expired token', 401)
    }

    return errorResponse(parseError(error), 500)
  } finally {
    if (session) {
      await session.close()
    }
  }
}
