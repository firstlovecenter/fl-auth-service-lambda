import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { hashPassword } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import { sendWelcomeEmail } from '../utils/notifications'

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
})

export const signup = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { email, password, firstName, lastName } =
      signupSchema.parse(req.body)

    session = getSession()

    // Check if user already exists
    const existingUser = await session.run(
      `MATCH (u:Member {email: $email}) RETURN u LIMIT 1`,
      { email },
    )

    if (existingUser.records.length > 0) {
      throw new ApiError(400, 'A user with this email already exists')
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const result = await session.run(
      `CREATE (person:Member)
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
      throw new ApiError(500, 'Failed to create user')
    }

    const record = result.records[0]
    const userId = record.get('id')
    const userEmail = record.get('email')

    // Send welcome email (non-blocking)
    sendWelcomeEmail(userEmail, firstName || 'User').catch((error) => {
      console.error('Failed to send welcome email:', error)
      // Don't fail the request if email fails
    })

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: userId,
        email: userEmail,
      },
    })
  } catch (error) {
    console.error('Signup error:', error)
    throw error
  } finally {
    if (session) {
      await session.close()
    }
  }
})
