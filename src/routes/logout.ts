import { Request, Response } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { getSession } from '../db/neo4j'
import { verifyJWT } from '../utils/auth'
import { asyncHandler } from '../middleware/errorHandler'

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

/**
 * Hash a token for safe storage (never store raw JWTs in the DB).
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export const logout = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { refreshToken } = logoutSchema.parse(req.body)

    // Attempt to verify the token to extract its expiry.
    // If it is already expired or invalid (e.g. client sent garbage), we
    // still return 200 — the token is already unusable, so logout succeeds.
    let expiresAt: string
    try {
      const decoded = await verifyJWT(refreshToken)
      expiresAt = decoded.exp
        ? new Date(decoded.exp * 1000).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    } catch {
      // Already expired or tampered — nothing to revoke
      res.status(200).json({ message: 'Logged out successfully' })
      return
    }

    const tokenHash = hashToken(refreshToken)

    session = getSession()

    // MERGE so that a second logout call on the same token is idempotent
    await session.run(
      `MERGE (t:RevokedToken { tokenHash: $tokenHash })
       SET t.revokedAt  = datetime(),
           t.expiresAt  = datetime($expiresAt)`,
      { tokenHash, expiresAt },
    )

    res.status(200).json({ message: 'Logged out successfully' })
  } finally {
    if (session) {
      await session.close()
    }
  }
})
