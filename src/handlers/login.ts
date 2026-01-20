import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { z } from 'zod'
import { initializeDB, getSession } from '../db/neo4j'
import { comparePassword, signJWT, signRefreshToken } from '../utils/auth'
import { errorResponse, successResponse } from '../utils/response'
import { parseError, parseRequestBody } from '../utils/validation'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  let session

  try {
    // IMPORTANT: Await the initialization
    await initializeDB()

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
      `MATCH (u:Member {email: $email}) 
       RETURN u.id as id, u.email as email, u.password as password, 
              u.firstName as firstName, u.lastName as lastName`,
      { email },
    )
    console.log('Query executed:', result.summary.query.text)
    console.log('Parameters:', result.summary.query.parameters)
    console.log('Records count:', result.records.length)
    if (result.records.length > 0) {
      console.log('First record keys:', result.records[0].keys)
    }
    console.log('Login query result records:', result.records)

    if (result.records.length === 0) {
      console.log('No user found with email:', email)
      return errorResponse('Invalid email or password', 401)
    }

    const record = result.records[0]
    const userId = record.get('id')
    const userEmail = record.get('email')
    const hashedPassword = record.get('password')
    const firstName = record.get('firstName')
    const lastName = record.get('lastName')

    // Check if password is null (legacy user without password)
    if (hashedPassword === null) {
      // Legacy user: Generate a one-time setup token (short-lived)
      const setupToken = signJWT(
        { userId, email: userEmail, action: 'password_setup' },
        '15m', // Pass expiresIn as second parameter
      )

      return successResponse(
        {
          message: 'Password setup required',
          action_required: 'setup_password',
          setup_token: setupToken,
          user: {
            id: userId,
            email: userEmail,
            firstName,
            lastName,
          },
        },
        202, // 202 Accepted signals "action needed"
      )
    }

    // Existing password check (only if not null)
    const isPasswordValid = await comparePassword(
      password,
      hashedPassword as string,
    )
    if (!isPasswordValid) {
      return errorResponse('Invalid email or password', 401)
    }

    // Update last login
    await session.run(
      `MATCH (u:Member {id: $userId})
       SET u.lastLoginAt = datetime()`,
      { userId },
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
