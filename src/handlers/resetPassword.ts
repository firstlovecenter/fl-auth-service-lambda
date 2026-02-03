import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { z } from 'zod'
import { initializeDB, getSession } from '../db/neo4j'
import {
  hashPassword,
  verifyJWT,
  signJWT,
  signRefreshToken,
} from '../utils/auth'
import { errorResponse, successResponse } from '../utils/response'
import { parseError, parseRequestBody } from '../utils/validation'

const resetPasswordSchema = z.object({
  reset_token: z.string().min(1, 'Reset token is required'),
  new_password: z.string().min(10, 'Password must be at least 10 characters'),
  confirm_password: z.string().min(1, 'Password confirmation is required'),
})

const ROLES_CLAIM = 'roles'

// Build roles from boolean flags (projection)
function deriveRolesFromFlags(flags: any): string[] {
  const roles: string[] = []

  // Leaders
  if (flags.leadsBacenta) roles.push('leaderBacenta')
  if (flags.leadsCampus) roles.push('leaderCampus')
  if (flags.leadsCouncil) roles.push('leaderCouncil')
  if (flags.leadsStream) roles.push('leaderStream')
  if (flags.leadsGovernorship) roles.push('leaderGovernorship')
  if (flags.leadsOversight) roles.push('leaderOversight')
  if (flags.leadsDenomination) roles.push('leaderDenomination')

  // Admins
  if (flags.isAdminForStream) roles.push('adminStream')
  if (flags.isAdminForCampus) roles.push('adminCampus')
  if (flags.isAdminForCouncil) roles.push('adminCouncil')
  if (flags.isAdminForGovernorship) roles.push('adminGovernorship')
  if (flags.isAdminForOversight) roles.push('adminOversight')
  if (flags.isAdminForDenomination) roles.push('adminDenomination')

  // Arrivals admins
  if (flags.isArrivalsAdminForStream) roles.push('arrivalsAdminStream')
  if (flags.isArrivalsAdminForCampus) roles.push('arrivalsAdminCampus')
  if (flags.isArrivalsAdminForCouncil) roles.push('arrivalsAdminCouncil')
  if (flags.isArrivalsAdminForGovernorship)
    roles.push('arrivalsAdminGovernorship')

  // Other arrivals / special roles
  if (flags.isArrivalsCounterForStream) roles.push('arrivalsCounterStream')
  if (flags.isArrivalsPayerCouncil) roles.push('tellerCouncil')
  if (flags.isTellerForStream) roles.push('tellerStream')
  if (flags.isSheepSeekerForStream) roles.push('sheepSeekerStream')

  return [...new Set(roles)]
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  let session

  try {
    await initializeDB()

    // Parse request body
    const body = parseRequestBody(event.body)

    // Validate input
    const parseResult = resetPasswordSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse(parseError(parseResult.error), 400)
    }

    const { reset_token, new_password, confirm_password } = parseResult.data

    // Check passwords match
    if (new_password !== confirm_password) {
      return errorResponse('Passwords do not match', 400)
    }

    // Verify reset token
    let decoded: any
    try {
      decoded = verifyJWT(reset_token)
    } catch (error) {
      return errorResponse(
        'Invalid or expired reset link. Please try logging in again.',
        400,
      )
    }

    // Verify this is a password reset token
    if (decoded.action !== 'password_reset') {
      return errorResponse('Invalid reset token', 400)
    }

    const { userId, email } = decoded

    session = getSession()

    // Hash new password
    const hashedPassword = await hashPassword(new_password)

    // Begin transaction to update password and fetch roles
    const tx = session.beginTransaction()

    try {
      // Update password and mark email as verified
      const updateResult = await tx.run(
        `MATCH (u:User {id: $userId, email: $email})
         SET u.password = $hashedPassword,
             u.email_verified = true,
             u.migration_completed = true,
             u.lastLoginAt = datetime(),
             u.updatedAt = datetime()
         RETURN u.id as id, u.email as email, u.firstName as firstName, u.lastName as lastName`,
        {
          userId,
          email,
          hashedPassword,
        },
      )

      if (updateResult.records.length === 0) {
        throw new Error('Reset failed - account not found or invalid')
      }

      // Fetch user roles
      const rolesResult = await tx.run(
        `MATCH (m:User {id: $userId})
         RETURN {
           leadsBacenta:        exists((m)-[:LEADS]->(:Bacenta)),
           leadsGovernorship:   exists((m)-[:LEADS]->(:Governorship)),
           leadsCouncil:        exists((m)-[:LEADS]->(:Council)),
           leadsStream:         exists((m)-[:LEADS]->(:Stream)),
           leadsCampus:         exists((m)-[:LEADS]->(:Campus)),
           leadsOversight:      exists((m)-[:LEADS]->(:Oversight)),
           leadsDenomination:   exists((m)-[:LEADS]->(:Denomination)),
           isAdminForCampus:        exists((m)-[:IS_ADMIN_FOR]->(:Campus)),
           isAdminForGovernorship:  exists((m)-[:IS_ADMIN_FOR]->(:Governorship)),
           isAdminForCouncil:       exists((m)-[:IS_ADMIN_FOR]->(:Council)),
           isAdminForStream:        exists((m)-[:IS_ADMIN_FOR]->(:Stream)),
           isAdminForOversight:     exists((m)-[:IS_ADMIN_FOR]->(:Oversight)),
           isAdminForDenomination:  exists((m)-[:IS_ADMIN_FOR]->(:Denomination)),
           isArrivalsAdminForStream: exists((m)-[:DOES_ARRIVALS_FOR]->(:Stream)),
           isArrivalsAdminForCampus: exists((m)-[:DOES_ARRIVALS_FOR]->(:Campus)),
           isArrivalsAdminForCouncil: exists((m)-[:DOES_ARRIVALS_FOR]->(:Council)),
           isArrivalsAdminForGovernorship: exists((m)-[:DOES_ARRIVALS_FOR]->(:Governorship)),
           isArrivalsCounterForStream: exists((m)-[:COUNTS_ARRIVALS_FOR]->(:Stream)),
           isArrivalsPayerCouncil: exists((m)-[:CONFIRMS_ARRIVALS_FOR]->(:Council)),
           isTellerForStream: exists((m)-[:IS_TELLER_FOR]->(:Stream)),
           isSheepSeekerForStream: exists((m)-[:IS_SHEEP_SEEKER_FOR]->(:Stream))
         } as roles`,
        { userId },
      )

      await tx.commit()

      const userRecord = updateResult.records[0]
      const rolesRecord = rolesResult.records[0]
      const roleFlags = rolesRecord.get('roles')

      const userEmail = userRecord.get('email')
      const firstName = userRecord.get('firstName')
      const lastName = userRecord.get('lastName')

      // Build roles
      const jwtRoles = deriveRolesFromFlags(roleFlags)

      // Generate full access tokens
      const payload = {
        sub: userId,
        userId,
        email: userEmail,
        [ROLES_CLAIM]: jwtRoles,
      }

      const accessToken = signJWT(payload, '30m')
      const refreshToken = signRefreshToken(payload)

      return successResponse({
        message: 'Password reset successful - welcome!',
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
      await tx.rollback()
      throw error
    }
  } catch (error) {
    console.error('Reset password error:', error)

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return errorResponse('Invalid reset link. User not found.', 404)
      }
    }

    return errorResponse(parseError(error), 500)
  } finally {
    if (session) {
      await session.close()
    }
  }
}
