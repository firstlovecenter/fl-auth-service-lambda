import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { SignOptions, JwtPayload } from 'jsonwebtoken'

// ──────────────────────────────────────────────────────────────────────────────
// Environment & Constants
// ──────────────────────────────────────────────────────────────────────────────

const PEPPER = process.env.PEPPER ?? '' // fallback to empty string is safe

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required')
}

// We know it's defined now → helps TS
const secret = JWT_SECRET as string // or Buffer if you ever switch to binary secret

// ──────────────────────────────────────────────────────────────────────────────
// Password Hashing (with pepper)
// ──────────────────────────────────────────────────────────────────────────────

export const hashPassword = async (password: string): Promise<string> => {
  // Pepper + good cost factor (12–13 is common; 14+ if you can afford it)
  return bcrypt.hash(password + PEPPER, 12)
}

export const comparePassword = async (
  raw: string,
  hash: string,
): Promise<boolean> => {
  return bcrypt.compare(raw + PEPPER, hash)
}

// ──────────────────────────────────────────────────────────────────────────────
// JWT Helpers
// ──────────────────────────────────────────────────────────────────────────────

type Payload = Record<string, unknown> // or define stricter interface: { userId: string; role: string; ... }

const DEFAULT_SIGN_OPTIONS: SignOptions = {
  expiresIn: '30m',
}

export const signJWT = (
  payload: Record<string, unknown>,
  expiresIn: string | number = '30m',
): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as any)
}

export const signRefreshToken = (payload: Payload): string => {
  return jwt.sign(payload, secret, { expiresIn: '7d' })
}

export const verifyJWT = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, secret)

    // jwt.verify returns string | JwtPayload | object — we almost always want JwtPayload
    if (typeof decoded === 'string') {
      throw new Error('Unexpected string payload from JWT')
    }

    return decoded as JwtPayload
  } catch (error) {
    // You can be more granular if you want:
    // if (error instanceof jwt.TokenExpiredError) { ... }
    throw new Error('Invalid or expired token')
  }
}
