import bcrypt from 'bcryptjs'
import { getSession } from '../db/neo4j'

export interface ExternalClient {
  clientId: string
  clientSecretHash: string
  redirectUris: string[]
  name: string
  active: boolean
}

/**
 * Looks up a registered, active external-SSO client by id. Returns null if
 * the client doesn't exist or has been disabled — callers must treat both
 * the same way (reject) rather than distinguishing them, so disabling a
 * client behaves exactly like deleting it.
 */
export const getActiveClient = async (
  clientId: string,
): Promise<ExternalClient | null> => {
  const session = getSession()
  try {
    const result = await session.run(
      `MATCH (c:ExternalClient {clientId: $clientId})
       WHERE c.active = true
       RETURN c { .clientId, .clientSecretHash, .redirectUris, .name, .active } AS client
       LIMIT 1`,
      { clientId },
    )
    if (result.records.length === 0) return null
    return result.records[0].get('client') as ExternalClient
  } finally {
    await session.close()
  }
}

/**
 * Client secrets are hashed with bcrypt directly — NOT hashPassword() from
 * utils/auth.ts, which couples to the user-password PEPPER. A client secret
 * is a different kind of credential and must not break if the pepper rotates.
 */
export const verifyClientSecret = async (
  client: ExternalClient,
  rawSecret: string,
): Promise<boolean> => {
  return bcrypt.compare(rawSecret, client.clientSecretHash)
}

export const isRedirectUriRegistered = (
  client: ExternalClient,
  redirectUri: string,
): boolean => client.redirectUris.includes(redirectUri)
