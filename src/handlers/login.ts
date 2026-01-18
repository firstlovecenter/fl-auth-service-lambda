import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { comparePassword, signJWT, signRefreshToken } from '../utils/auth'
import { errorResponse, successResponse } from '../utils/response'
import { parseError, parseRequestBody } from '../utils/validation'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  let session
  
  try {
    // Parse request body
    const body = parseRequestBody(event.body)

    // Validate input
    const parseResult = loginSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse(parseError(parseResult.error), 400)
    }

    const { email, password } = parseResult.data

    session = getSession()

    // Find user
    const result = await session.run(
      `MATCH (u:Members {email: $email}) 
       RETURN u.id as id, u.email as email, u.password as password, 
              u.firstName as firstName, u.lastName as lastName`,
      { email }
    )

    if (result.records.length === 0) {
      return errorResponse('Invalid email or password', 401)
    }

    const record = result.records[0]
    const userId = record.get('id')
    const userEmail = record.get('email')
    const hashedPassword = record.get('password')
    const firstName = record.get('firstName')
    const lastName = record.get('lastName')

    // Verify password
    const isPasswordValid = await comparePassword(password, hashedPassword)
    if (!isPasswordValid) {
      return errorResponse('Invalid email or password', 401)
    }

    // Update last login
    await session.run(
      `MATCH (u:User {id: $userId})
       SET u.lastLoginAt = datetime()`,
      { userId }
    )

    // Generate tokens
    const accessToken = signJWT({ userId, email: userEmail })
    const refreshToken = signRefreshToken({ userId, email: userEmail })

    return successResponse({
      message: 'Login successful',
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
    console.error('Login error:', error)
    return errorResponse(parseError(error), 500)
  } finally {
    if (session) {
      await session.close()
    }
  }
}
