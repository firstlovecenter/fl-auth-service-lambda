import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import type { SignOptions, JwtPayload } from 'jsonwebtoken'
import { getSecret, loadSecrets } from './secrets'

// ──────────────────────────────────────────────────────────────────────────────
// Access-token claim pins (SYN-176)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Default `iss` (who minted the token) and `aud` (who the token is for) stamped
 * onto every access token. The admin API validates these against its own
 * `JWT_ISSUER` / `JWT_AUDIENCE` secrets, so a token minted with a shared
 * `JWT_SECRET` but for a different audience is rejected. Overridable via the
 * `JWT_ISSUER` / `JWT_AUDIENCE` secrets — but the values MUST stay in lockstep
 * with the API or every authenticated request 401s.
 */
export const ACCESS_TOKEN_ISSUER = 'fl-auth-service'
export const ACCESS_TOKEN_AUDIENCE = 'fl-admin-portal'

// ──────────────────────────────────────────────────────────────────────────────
// Cached secrets
// ──────────────────────────────────────────────────────────────────────────────

let cachedJWTSecret: string | null = null
let cachedPepper: string | null = null
let cachedIssuer: string | null = null
let cachedAudience: string | null = null

// ──────────────────────────────────────────────────────────────────────────────
// Get secrets (cached)
// ──────────────────────────────────────────────────────────────────────────────

const getJWTSecret = async (): Promise<string> => {
  if (!cachedJWTSecret) {
    cachedJWTSecret = await getSecret('JWT_SECRET')

    if (!cachedJWTSecret || typeof cachedJWTSecret !== 'string') {
      console.error('JWT_SECRET is invalid:', {
        type: typeof cachedJWTSecret,
        value: cachedJWTSecret ? 'exists' : 'null/undefined',
      })
      throw new Error('JWT_SECRET is not a valid string')
    }

    const digest = crypto
      .createHash('sha256')
      .update(cachedJWTSecret)
      .digest('hex')
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'JWT_SECRET loaded',
        secretHash: digest,
        secretLength: cachedJWTSecret.length,
      }),
    )
  }
  return cachedJWTSecret
}

const getPepper = async (): Promise<string> => {
  if (!cachedPepper) {
    cachedPepper = await getSecret('PEPPER')
  }
  return cachedPepper
}

/**
 * Resolve the access-token `iss` / `aud`, preferring the optional secrets and
 * falling back to the code defaults. Read via `loadSecrets()` (not `getSecret`,
 * which throws on absent keys) because these overrides are optional.
 */
const getIssuer = async (): Promise<string> => {
  if (cachedIssuer === null) {
    const secrets = await loadSecrets()
    cachedIssuer = secrets.JWT_ISSUER || ACCESS_TOKEN_ISSUER
  }
  return cachedIssuer
}

const getAudience = async (): Promise<string> => {
  if (cachedAudience === null) {
    const secrets = await loadSecrets()
    cachedAudience = secrets.JWT_AUDIENCE || ACCESS_TOKEN_AUDIENCE
  }
  return cachedAudience
}

// ──────────────────────────────────────────────────────────────────────────────
// Password Hashing (with pepper)
// ──────────────────────────────────────────────────────────────────────────────

export const hashPassword = async (password: string): Promise<string> => {
  const pepper = await getPepper()
  return bcrypt.hash(password + pepper, 12)
}

export const comparePassword = async (
  raw: string,
  hash: string,
): Promise<boolean> => {
  const pepper = await getPepper()
  return bcrypt.compare(raw + pepper, hash)
}

// ──────────────────────────────────────────────────────────────────────────────
// JWT Helpers
// ──────────────────────────────────────────────────────────────────────────────

type Payload = Record<string, unknown>

const DEFAULT_SIGN_OPTIONS: SignOptions = {
  expiresIn: '30m',
}

/**
 * Refresh-token lifetime, in seconds (7 days). Single source of truth shared by
 * the signed JWT (below) and the httpOnly cookie's Max-Age (utils/cookies.ts)
 * so the two can never drift (SYN-173).
 */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

export const signJWT = async (
  payload: Record<string, unknown>,
  expiresIn: string | number = '30m',
): Promise<string> => {
  const secret = await getJWTSecret()
  const issuer = await getIssuer()
  const audience = await getAudience()
  // SYN-176: stamp `iss` / `aud` so the admin API can verify the token was
  // minted by this service *for it* — a valid signature from the shared
  // `JWT_SECRET` is no longer sufficient on its own.
  return jwt.sign(payload, secret, {
    expiresIn,
    algorithm: 'HS256', // Explicitly set algorithm
    issuer,
    audience,
  } as any)
}

export const signRefreshToken = async (
  payload: Record<string, unknown>,
): Promise<string> => {
  const secret = await getJWTSecret()
  return jwt.sign(payload, secret, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  } as any)
}

export const verifyJWT = async (token: string): Promise<JwtPayload> => {
  try {
    const secret = await getJWTSecret()
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'], // Explicitly allow only HS256
    })

    if (typeof decoded === 'string') {
      throw new Error('Unexpected string payload from JWT')
    }

    return decoded as JwtPayload
  } catch (error) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'JWT verification error (raw)',
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    )
    throw new Error('Invalid or expired token')
  }
}
