/**
 * Phase 1 proof (SSO_IMPLEMENTATION_SPEC.md 1.3): the RS256 signing +
 * JWKS-serving trust mechanism works end to end, offline.
 *
 * Pure logic — no Neo4j/AWS required (the secrets module is mocked).
 */

import crypto from 'crypto'
import jwt from 'jsonwebtoken'

const TEST_KID = 'flc-ext-test-1'

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

jest.mock('../utils/secrets', () => ({
  loadSecrets: jest.fn(async () => ({
    EXT_RS256_PRIVATE_KEY: privateKey,
    EXT_RS256_PUBLIC_KEY: publicKey,
    EXT_RS256_KID: TEST_KID,
  })),
}))

// eslint-disable-next-line import/first
import { signExternalJWT, getJWKS, EXTERNAL_TOKEN_ISSUER } from '../utils/externalAuth'

describe('external SSO — RS256 + JWKS trust mechanism', () => {
  it('signs a JWT that verifies against the key served by getJWKS()', async () => {
    const token = await signExternalJWT(
      { sub: 'user-1', email: 'a@example.com', name: 'A B', aud: 'camp-app' },
      '5m',
    )

    const jwks = await getJWKS()
    expect(jwks.keys).toHaveLength(1)
    const jwk = jwks.keys[0]
    expect(jwk.kid).toBe(TEST_KID)
    expect(jwk.kty).toBe('RSA')
    expect(jwk.alg).toBe('RS256')

    // Reconstruct the public key purely from the JWKS output — proves an
    // external verifier could do the same with only what this endpoint serves.
    const reconstructedKey = crypto.createPublicKey({
      key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
      format: 'jwk',
    })

    const decoded = jwt.verify(token, reconstructedKey, {
      algorithms: ['RS256'],
      issuer: EXTERNAL_TOKEN_ISSUER,
      audience: 'camp-app',
    }) as Record<string, unknown>

    expect(decoded.sub).toBe('user-1')
    expect(decoded.email).toBe('a@example.com')
  })

  it('stamps the kid header so verifiers can select the right JWKS key', async () => {
    const token = await signExternalJWT({ sub: 'user-1' }, '5m')
    const header = jwt.decode(token, { complete: true })?.header
    expect(header?.kid).toBe(TEST_KID)
    expect(header?.alg).toBe('RS256')
  })

  it('rejects verification against the wrong key', async () => {
    const token = await signExternalJWT({ sub: 'user-1' }, '5m')
    const { publicKey: otherKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })

    expect(() =>
      jwt.verify(token, otherKey, { algorithms: ['RS256'] }),
    ).toThrow()
  })
})
