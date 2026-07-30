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

const getExternalKeys = async (): Promise<ExternalKeys> => {
  if (!cachedKeys) {
    const secrets = await loadSecrets()
    const { EXT_RS256_PRIVATE_KEY, EXT_RS256_PUBLIC_KEY, EXT_RS256_KID } = secrets

    if (!EXT_RS256_PRIVATE_KEY || !EXT_RS256_PUBLIC_KEY || !EXT_RS256_KID) {
      throw new Error(
        'External RS256 signing keys are not configured (EXT_RS256_PRIVATE_KEY / EXT_RS256_PUBLIC_KEY / EXT_RS256_KID)',
      )
    }

    cachedKeys = {
      privateKey: EXT_RS256_PRIVATE_KEY,
      publicKey: EXT_RS256_PUBLIC_KEY,
      kid: EXT_RS256_KID,
    }
  }
  return cachedKeys
}

/**
 * Sign an external-SSO identity token (RS256). Callers must only ever pass
 * `id`/`email`/`name` claims — never roles or internal fields (SSO_SPEC).
 */
export const signExternalJWT = async (
  payload: Record<string, unknown>,
  expiresIn: string | number,
): Promise<string> => {
  const { privateKey, kid } = await getExternalKeys()
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
 */
export const getJWKS = async (): Promise<{ keys: JWK[] }> => {
  const { publicKey, kid } = await getExternalKeys()
  const keyObject = crypto.createPublicKey(publicKey)
  const { n, e } = keyObject.export({ format: 'jwk' }) as { n: string; e: string }

  return {
    keys: [{ kty: 'RSA', use: 'sig', kid, alg: 'RS256', n, e }],
  }
}
