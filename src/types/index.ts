export interface User {
  id: string
  email: string
  password: string
  firstName?: string
  lastName?: string
  isFisher?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ChurchNodeInfo {
  id: string
  name: string
}

export interface MembershipInfo {
  bacenta: ChurchNodeInfo | null
  governorship: ChurchNodeInfo | null
  council: ChurchNodeInfo | null
  stream: ChurchNodeInfo | null
}

export interface JWTPayload {
  userId: string
  email: string
  iat?: number
  exp?: number
}

export interface SignupRequest {
  email: string
  password: string
  firstName?: string
  lastName?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface VerifyRequest {
  token: string
}

// ──────────────────────────────────────────────────────────────────────────────
// External SSO (OAuth2 authorization-code flow)
// ──────────────────────────────────────────────────────────────────────────────

/** Claims on the RS256-signed identity token issued to external apps. Never
 * add roles or internal fields here — external apps get identity only. */
export interface ExternalJWTPayload {
  iss: string
  aud: string
  sub: string
  email: string
  name: string
  iat?: number
  exp?: number
}
