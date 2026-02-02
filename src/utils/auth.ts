import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { SignOptions, JwtPayload } from 'jsonwebtoken'
import { getSecret } from './secrets'

// ──────────────────────────────────────────────────────────────────────────────
// Cached secrets
// ──────────────────────────────────────────────────────────────────────────────

let cachedJWTSecret: string | null = null
let cachedPepper: string | null = null

// ──────────────────────────────────────────────────────────────────────────────
// Get secrets (cached)
// ──────────────────────────────────────────────────────────────────────────────

const getJWTSecret = async (): Promise<string> => {
  if (!cachedJWTSecret) {
    cachedJWTSecret = await getSecret('JWT_SECRET')
  }
  return cachedJWTSecret
}

const getPepper = async (): Promise<string> => {
  if (!cachedPepper) {
    cachedPepper = await getSecret('PEPPER')
  }
  return cachedPepper
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

export const signJWT = async (
  payload: Record<string, unknown>,
  expiresIn: string | number = '30m',
): Promise<string> => {
  const secret = await getJWTSecret()
  return jwt.sign(payload, secret, { expiresIn } as any)
}

export const signRefreshToken = async (payload: Record<string, unknown>): Promise<string> => {
  const secret = await getJWTSecret()
  return jwt.sign(payload, secret, { expiresIn: '7d' })
}

export const verifyJWT = async (token: string): Promise<JwtPayload> => {
  try {
    const secret = await getJWTSecret()
    const decoded = jwt.verify(token, secret)

    if (typeof decoded === 'string') {
      throw new Error('Unexpected string payload from JWT')
    }

    return decoded as JwtPayload
  } catch (error) {
    // if (error instanceof jwt.TokenExpiredError) { ... }
    throw new Error('Invalid or expired token')
  }
}
