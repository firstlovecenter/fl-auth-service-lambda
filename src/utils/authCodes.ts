import crypto from 'crypto'
import { getSession } from '../db/neo4j'

/** Single-use code lifetime (SSO_SPEC 2.2: "~60 seconds from issue"). */
export const AUTH_CODE_TTL_MS = 60 * 1000

export const createAuthCode = async (
  clientId: string,
  userId: string,
  redirectUri: string,
): Promise<string> => {
  const code = crypto.randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + AUTH_CODE_TTL_MS

  const session = getSession()
  try {
    await session.run(
      `CREATE (c:ExternalAuthCode {
         code: $code,
         clientId: $clientId,
         userId: $userId,
         redirectUri: $redirectUri,
         expiresAt: $expiresAt,
         used: false,
         createdAt: datetime()
       })`,
      { code, clientId, userId, redirectUri, expiresAt },
    )
    return code
  } finally {
    await session.close()
  }
}

export interface AuthCodeFields {
  clientId: string
  userId: string
  redirectUri: string
}

/**
 * Read-only lookup — does NOT mark the code used. Callers must validate the
 * returned client_id/redirect_uri against the request BEFORE calling
 * consumeAuthCode(): if we marked it used here, a request presenting a valid
 * code with the wrong client_id/redirect_uri would burn it, permanently
 * denying the legitimate exchange (a self-inflicted DoS).
 */
export const peekAuthCode = async (
  code: string,
): Promise<AuthCodeFields | null> => {
  const session = getSession()
  try {
    const result = await session.run(
      `MATCH (c:ExternalAuthCode {code: $code, used: false})
       WHERE c.expiresAt > $now
       RETURN c { .clientId, .userId, .redirectUri } AS code`,
      { code, now: Date.now() },
    )
    if (result.records.length === 0) return null
    return result.records[0].get('code') as AuthCodeFields
  } finally {
    await session.close()
  }
}

/**
 * Atomically marks a code used. Only call this AFTER validating the code's
 * client_id/redirect_uri match the request. The `used: false` guard inside
 * the MATCH (rather than a separate read-then-write) is what makes this
 * single-use under concurrent replay of the exact same request — Neo4j only
 * lets one concurrent transaction win the SET on a given node. Returns false
 * if the code was already consumed by a racing request since the caller's
 * peekAuthCode() call.
 */
export const consumeAuthCode = async (code: string): Promise<boolean> => {
  const session = getSession()
  try {
    const result = await session.run(
      `MATCH (c:ExternalAuthCode {code: $code, used: false})
       WHERE c.expiresAt > $now
       SET c.used = true
       RETURN c.code AS code`,
      { code, now: Date.now() },
    )
    return result.records.length > 0
  } finally {
    await session.close()
  }
}
