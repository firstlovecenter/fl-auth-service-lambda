import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { hashPassword } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import { sendWelcomeEmail } from '../utils/notifications'

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  whatsappNumber: z.string().optional(),
})

export const signup = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { email, password, firstName, lastName, whatsappNumber } =
      signupSchema.parse(req.body)

    session = getSession()

    // 1. Check for inactive member first (they can be reactivated)
    const inactiveMemberResult = await session.run(
      `MATCH (m:Member {email: $email})
       WHERE m.markedInactive = true
       RETURN m.id as id, m.email as email, m.firstName as firstName, m.lastName as lastName
       LIMIT 1`,
      { email },
    )

    if (inactiveMemberResult.records.length > 0) {
      const inactiveMember = inactiveMemberResult.records[0]
      const memberId = inactiveMember.get('id')
      const memberFirstName = inactiveMember.get('firstName')
      const memberLastName = inactiveMember.get('lastName')

      throw new ApiError(
        409,
        `An inactive account exists for ${memberFirstName} ${memberLastName}. Please contact support to reactivate your account.`,
      )
    }

    // 2. Check for duplicate email (active members/users)
    const emailCheckResult = await session.run(
      `MATCH (u)
       WHERE (u:User OR u:Member) AND u.email = $email
       RETURN u.id as id, u.email as email, u.firstName as firstName, u.lastName as lastName
       LIMIT 1`,
      { email },
    )

    if (emailCheckResult.records.length > 0) {
      const existingUser = emailCheckResult.records[0]
      const existingFirstName = existingUser.get('firstName')
      const existingLastName = existingUser.get('lastName')

      throw new ApiError(
        409,
        `There is already an account with this email "${email}" for ${existingFirstName} ${existingLastName}`,
      )
    }

    // 3. Check for duplicate WhatsApp number (if provided)
    if (whatsappNumber) {
      const whatsappCheckResult = await session.run(
        `MATCH (m:Member {whatsappNumber: $whatsappNumber})
         RETURN m.id as id, m.whatsappNumber as whatsappNumber, m.firstName as firstName, m.lastName as lastName
         LIMIT 1`,
        { whatsappNumber },
      )

      if (whatsappCheckResult.records.length > 0) {
        const existingMember = whatsappCheckResult.records[0]
        const existingFirstName = existingMember.get('firstName')
        const existingLastName = existingMember.get('lastName')

        throw new ApiError(
          409,
          `There is already a member with this WhatsApp number "${whatsappNumber}" for ${existingFirstName} ${existingLastName}`,
        )
      }
    }

    // 4. Hash password
    const hashedPassword = await hashPassword(password)

    // 5. Create user
    const result = await session.run(
      `CREATE (person:User)
       SET person.id = randomUUID(),
           person.email = $email,
           person.password = $password,
           person.firstName = $firstName,
           person.lastName = $lastName,
           person.whatsappNumber = $whatsappNumber,
           person.markedInactive = false,
           person.createdAt = datetime(),
           person.updatedAt = datetime()
       RETURN person.id as id, person.email as email, person.firstName as firstName, person.lastName as lastName`,
      {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        whatsappNumber: whatsappNumber || null,
      },
    )

    if (result.records.length === 0) {
      throw new ApiError(500, 'Failed to create user')
    }

    const record = result.records[0]
    const userId = record.get('id')
    const userEmail = record.get('email')

    // 6. Send welcome email (non-blocking)
    sendWelcomeEmail(userEmail, firstName).catch((error) => {
      console.error('Failed to send welcome email:', error)
    })

    // 7. Log security event
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'user_signup',
        userId,
        email: userEmail,
        clientIP: req.headers['x-forwarded-for'] || req.ip,
      }),
    )

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: userId,
        email: userEmail,
        firstName,
        lastName,
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
