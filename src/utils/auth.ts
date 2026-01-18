import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const PEPPER = process.env.PEPPER || ''
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password + PEPPER, 12)
}

export const comparePassword = async (
  raw: string,
  hash: string
): Promise<boolean> => {
  return await bcrypt.compare(raw + PEPPER, hash)
}

export const signJWT = (
  payload: Record<string, unknown>,
  expiresIn: string = '30m'
): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn })
}

export const signRefreshToken = (payload: Record<string, unknown>): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export const verifyJWT = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (error) {
    throw new Error('Invalid or expired token')
  }
}
