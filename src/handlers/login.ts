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

    // Find user + roles (lookup by email or id)
    const result = await session.run(
      `MATCH (m:User)
       WHERE ($email IS NOT NULL AND m.email = $email)
          OR ($id IS NOT NULL AND m.id = $id)
       RETURN
         m { .id, .firstName, .lastName, .email, .password } AS member,
         {
           // Leadership / Leads
           leadsBacenta:        exists((m)-[:LEADS]->(:Bacenta)),
           leadsGovernorship:   exists((m)-[:LEADS]->(:Governorship)),
           leadsCouncil:        exists((m)-[:LEADS]->(:Council)),
           leadsStream:         exists((m)-[:LEADS]->(:Stream)),
           leadsCampus:         exists((m)-[:LEADS]->(:Campus)),
           leadsOversight:      exists((m)-[:LEADS]->(:Oversight)),
           leadsDenomination:   exists((m)-[:LEADS]->(:Denomination)),

           // Admin
           isAdminForCampus:        exists((m)-[:IS_ADMIN_FOR]->(:Campus)),
           isAdminForGovernorship:  exists((m)-[:IS_ADMIN_FOR]->(:Governorship)),
           isAdminForCouncil:       exists((m)-[:IS_ADMIN_FOR]->(:Council)),
           isAdminForStream:        exists((m)-[:IS_ADMIN_FOR]->(:Stream)),
           isAdminForOversight:     exists((m)-[:IS_ADMIN_FOR]->(:Oversight)),
           isAdminForDenomination:  exists((m)-[:IS_ADMIN_FOR]->(:Denomination)),

           // Arrivals Admin
           isArrivalsAdminForGovernorship: exists((m)-[:DOES_ARRIVALS_FOR]->(:Governorship)),
           isArrivalsAdminForCouncil:      exists((m)-[:DOES_ARRIVALS_FOR]->(:Council)),
           isArrivalsAdminForStream:       exists((m)-[:DOES_ARRIVALS_FOR]->(:Stream)),
           isArrivalsAdminForCampus:       exists((m)-[:DOES_ARRIVALS_FOR]->(:Campus)),

           // Other Arrivals / Special Roles
           isArrivalsCounterForStream:     exists((m)-[:COUNTS_ARRIVALS_FOR]->(:Stream)),
           isArrivalsPayerCouncil:         exists((m)-[:CONFIRMS_ARRIVALS_FOR]->(:Council)),
           isTellerForStream:              exists((m)-[:IS_TELLER_FOR]->(:Stream)),
           isSheepSeekerForStream:         exists((m)-[:IS_SHEEP_SEEKER_FOR]->(:Stream))
         } AS roles`,
      {
        email,
        id: null,
      },
    )

    if (result.records.length === 0) {
      return errorResponse('Invalid email or password', 401)
    }

    const record = result.records[0]
    const member = record.get('member')
    const roleFlags = record.get('roles') as Record<string, boolean>

    // Check if password is NULL (user needs to set up password)
    if (member.password == null) {
      return errorResponse(
        "Password not set. Please use 'Forgot Password' to set up your password.",
        401,
        { requiresPasswordSetup: true },
      )
    }

    // Verify password
    const isPasswordValid = await comparePassword(
      password,
      String(member.password),
    )
    if (!isPasswordValid) {
      return errorResponse('Invalid email or password', 401)
    }

    // Update last login
    await session.run(
      `MATCH (u:User {id: $userId}) SET u.lastLoginAt = datetime()`,
      { userId: member.id },
    )

    // Build roles from boolean flags (explicit mapping)
    const jwtRoles: string[] = []
    if (roleFlags.leadsBacenta) jwtRoles.push('leaderBacenta')
    if (roleFlags.leadsGovernorship) jwtRoles.push('leaderGovernorship')
    if (roleFlags.leadsCouncil) jwtRoles.push('leaderCouncil')
    if (roleFlags.leadsStream) jwtRoles.push('leaderStream')
    if (roleFlags.leadsCampus) jwtRoles.push('leaderCampus')
    if (roleFlags.leadsOversight) jwtRoles.push('leaderOversight')
    if (roleFlags.leadsDenomination) jwtRoles.push('leaderDenomination')

    if (roleFlags.isAdminForCampus) jwtRoles.push('adminCampus')
    if (roleFlags.isAdminForGovernorship) jwtRoles.push('adminGovernorship')
    if (roleFlags.isAdminForCouncil) jwtRoles.push('adminCouncil')
    if (roleFlags.isAdminForStream) jwtRoles.push('adminStream')
    if (roleFlags.isAdminForOversight) jwtRoles.push('adminOversight')
    if (roleFlags.isAdminForDenomination) jwtRoles.push('adminDenomination')

    if (roleFlags.isArrivalsAdminForGovernorship)
      jwtRoles.push('arrivalsAdminGovernorship')
    if (roleFlags.isArrivalsAdminForCouncil)
      jwtRoles.push('arrivalsAdminCouncil')
    if (roleFlags.isArrivalsAdminForStream) jwtRoles.push('arrivalsAdminStream')
    if (roleFlags.isArrivalsAdminForCampus) jwtRoles.push('arrivalsAdminCampus')

    if (roleFlags.isArrivalsCounterForStream)
      jwtRoles.push('arrivalsCounterStream')
    if (roleFlags.isArrivalsPayerCouncil) jwtRoles.push('tellerCouncil')
    if (roleFlags.isTellerForStream) jwtRoles.push('tellerStream')
    if (roleFlags.isSheepSeekerForStream) jwtRoles.push('sheepSeekerStream')

    const roles = [...new Set(jwtRoles)]

    // Issue tokens with custom claim
    const payload = {
      sub: member.id ?? member.auth_id,
      userId: member.id,
      email: member.email,
      [ROLES_CLAIM]: roles,
    }

    const accessToken = signJWT(payload, '30m')
    const refreshToken = signRefreshToken(payload)

    return successResponse({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
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
