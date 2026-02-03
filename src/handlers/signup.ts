import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { hashPassword } from '../utils/auth'
import { errorResponse, successResponse } from '../utils/response'
import { parseError, parseRequestBody } from '../utils/validation'

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
})

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  let session

  try {
    // Parse request body
    const body = parseRequestBody(event.body)

    // Validate input
    const parseResult = signupSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse(parseError(parseResult.error), 400)
    }

    const { email, password, firstName, lastName } = parseResult.data

    session = getSession()

    // Check if user already exists (check both Member and User labels)
    const existingUser = await session.run(
      `MATCH (u) WHERE u:Member OR u:User AND u.email = $email RETURN u LIMIT 1`,
      { email },
    )

    if (existingUser.records.length > 0) {
      return errorResponse('A user with this email already exists', 400)
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user with both Member and User labels
    const result = await session.run(
      `CREATE (person:Member:User)
       SET person.id = randomUUID(),
           person.email = $email,
           person.password = $password,
           person.firstName = $firstName,
           person.lastName = $lastName,
           person.createdAt = datetime(),
           person.updatedAt = datetime()
       RETURN person.id as id, person.email as email`,
      {
        email,
        password: hashedPassword,
        firstName: firstName || '',
        lastName: lastName || '',
      },
    )

    if (result.records.length === 0) {
      return errorResponse('Failed to create user', 500)
    }

    const record = result.records[0]
    const userId = record.get('id')
    const userEmail = record.get('email')

    return successResponse(
      {
        message: 'User created successfully',
        user: {
          id: userId,
          email: userEmail,
        },
      },
      201,
    )
  } catch (error) {
    console.error('Signup error:', error)
    return errorResponse(parseError(error), 500)
  } finally {
    if (session) {
      await session.close()
    }
  }
}
