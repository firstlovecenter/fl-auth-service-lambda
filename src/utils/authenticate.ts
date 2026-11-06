import { getSession } from '../db/neo4j'
import { comparePassword } from './auth'
import { ApiError } from '../middleware/errorHandler'

/**
 * The security-critical part of password auth, shared by /auth/login and the
 * external-SSO login (SSO_SPEC: "reuse existing login logic, don't
 * reimplement it"). Deliberately takes just the stored hash, not a whole
 * query shape — /auth/login and the SSO flow fetch different fields (the
 * former also needs membership/role flags in the same round trip) but both
 * MUST apply this exact same NULL-password / bcrypt-compare / error-message
 * logic, unchanged.
 */
export const verifyMemberPassword = async (
  storedPasswordHash: string | null | undefined,
  rawPassword: string,
): Promise<void> => {
  if (storedPasswordHash === null || storedPasswordHash === undefined) {
    throw new ApiError(
      401,
      "Password not set. Please use 'Forgot Password' to set up your password.",
      { requiresPasswordSetup: true },
    )
  }

  const passwordMatch = await comparePassword(rawPassword, storedPasswordHash)
  if (!passwordMatch) {
    throw new ApiError(401, 'Invalid email or password')
  }
}

export interface AuthenticatedMember {
  id: string
  email: string
  firstName?: string
  lastName?: string
}

/**
 * Full authenticate-by-email-and-password used by the external-SSO login
 * page. Fetches only id/email/name — no membership or role flags, since the
 * external JWT (Phase 2) must never expose them.
 */
export const authenticateUser = async (
  email: string,
  password: string,
): Promise<AuthenticatedMember> => {
  const session = getSession()
  try {
    const result = await session.run(
      `MATCH (m:User:Member {email: $email})
       RETURN m { .id, .firstName, .lastName, .email, .password } AS member
       LIMIT 1`,
      { email },
    )

    if (result.records.length === 0) {
      throw new ApiError(401, 'Invalid email or password')
    }

    const member = result.records[0].get('member')
    await verifyMemberPassword(member.password, password)

    return {
      id: member.id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
    }
  } finally {
    await session.close()
  }
}
