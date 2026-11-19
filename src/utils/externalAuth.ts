import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import { loadSecrets } from './secrets'

/**
 * FLC Auth's issuer identity for RS256-signed external-SSO tokens (separate
 * from the internal HS256 access token's `iss`/`aud` in utils/auth.ts — this
 * is the identity external apps verify against the JWKS endpoint).
 */
export const EXTERNAL_TOKEN_ISSUER = 'https://auth.firstlovecenter.com'

interface ExternalKeys {
  privateKey: string
  publicKey: string
  kid: string
}

let cachedKeys: ExternalKeys | null = null

/**
 * The EXT_RS256_* keys are optional (utils/secrets.ts): until they are seeded
 * into an environment's secret, external SSO is simply off there. Callers use
 * this to answer cleanly instead of throwing into the global error handler,
 * which logs at ERROR and files a ticket for every scanner hit (SYN-256).
 */
export const EXTERNAL_SSO_UNAVAILABLE_MESSAGE =
  'External sign-in is not available'

/**
 * Thrown by getExternalKeys() when the keys are missing — callers that reach
 * it without checking isExternalSigningConfigured() first still get a
 * recognisable error rather than a generic one.
 */
export class ExternalKeysNotConfiguredError extends Error {
  constructor() {
    super(
      'External RS256 signing keys are not configured (EXT_RS256_PRIVATE_KEY / EXT_RS256_PUBLIC_KEY / EXT_RS256_KID)',
    )
    this.name = 'ExternalKeysNotConfiguredError'
    Object.setPrototypeOf(this, ExternalKeysNotConfiguredError.prototype)
  }
}

const getExternalKeys = async (): Promise<ExternalKeys | null> => {
  if (!cachedKeys) {
    const secrets = await loadSecrets()
    const { EXT_RS256_PRIVATE_KEY, EXT_RS256_PUBLIC_KEY, EXT_RS256_KID } = secrets

    // Not cached when missing: the keys may be seeded later, and the secrets
    // themselves are already cached per container by loadSecrets().
    if (!EXT_RS256_PRIVATE_KEY || !EXT_RS256_PUBLIC_KEY || !EXT_RS256_KID) {
      return null
    }

    cachedKeys = {
      privateKey: EXT_RS256_PRIVATE_KEY,
      publicKey: EXT_RS256_PUBLIC_KEY,
      kid: EXT_RS256_KID,
    }
  }
  return cachedKeys
}

const requireExternalKeys = async (): Promise<ExternalKeys> => {
  const keys = await getExternalKeys()
  if (!keys) {
    throw new ExternalKeysNotConfiguredError()
  }
  return keys
}

/**
 * Whether external SSO can sign tokens in this environment. Never throws for
 * missing keys — only a real secrets-load failure propagates.
 */
export const isExternalSigningConfigured = async (): Promise<boolean> =>
  (await getExternalKeys()) !== null

/**
 * Log line for a request turned away because SSO is off. Deliberately WARN,
 * not ERROR: it is expected in an environment without the keys, not a fault.
 */
export const logExternalSsoUnavailable = (path: string): void => {
  console.warn(
    `External SSO request to ${path} declined: RS256 signing keys are not configured`,
  )
}

/**
 * Sign an external-SSO identity token (RS256). Callers must only ever pass
 * `id`/`email`/`name` claims — never roles or internal fields (SSO_SPEC).
 */
export const signExternalJWT = async (
  payload: Record<string, unknown>,
  expiresIn: string | number,
): Promise<string> => {
  const { privateKey, kid } = await requireExternalKeys()
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn,
    issuer: EXTERNAL_TOKEN_ISSUER,
    keyid: kid,
  } as SignOptions)
}

interface JWK {
  kty: 'RSA'
  use: 'sig'
  kid: string
  alg: 'RS256'
  n: string
  e: string
}

/**
 * Public JWKS document served at /.well-known/jwks.json. Only the public key
 * is ever touched here — the private key never leaves getExternalKeys().
 * With no keys configured this is an empty key set, which is a valid JWKS
 * document: there is simply nothing an external app could verify against.
 */
export const getJWKS = async (): Promise<{ keys: JWK[] }> => {
  const keys = await getExternalKeys()
  if (!keys) {
    return { keys: [] }
  }

  const { publicKey, kid } = keys
  const keyObject = crypto.createPublicKey(publicKey)
  const { n, e } = keyObject.export({ format: 'jwk' }) as { n: string; e: string }

  return {
    keys: [{ kty: 'RSA', use: 'sig', kid, alg: 'RS256', n, e }],
  }
}
