/**
 * Unit tests for the access-token claim stamping (SYN-176).
 *
 * Pure logic — no Neo4j/AWS required (the secrets module is mocked). Covers the
 * security-critical bit: every token signJWT mints carries `iss` / `aud` (so the
 * admin API can pin them) plus an `exp` (so the API can reject never-expiring
 * tokens).
 */

import jwt from 'jsonwebtoken'

// Mock the secrets loader so signJWT runs offline. JWT_ISSUER / JWT_AUDIENCE are
// intentionally absent so the code defaults apply.
jest.mock('../utils/secrets', () => ({
  getSecret: jest.fn(async (key: string) => {
    if (key === 'JWT_SECRET') return 'unit-test-secret'
    if (key === 'PEPPER') return 'unit-test-pepper'
    throw new Error(`Secret not found: ${key}`)
  }),
  loadSecrets: jest.fn(async () => ({ JWT_SECRET: 'unit-test-secret' })),
}))

// eslint-disable-next-line import/first
import {
  signJWT,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_AUDIENCE,
} from '../utils/auth'

describe('signJWT — claim stamping (SYN-176)', () => {
  it('stamps iss and aud from the code defaults', async () => {
    const token = await signJWT({ userId: 'm1', roles: ['leaderBacenta'] })
    const decoded = jwt.decode(token) as Record<string, unknown>

    expect(decoded.iss).toBe(ACCESS_TOKEN_ISSUER)
    expect(decoded.aud).toBe(ACCESS_TOKEN_AUDIENCE)
  })

  it('stamps an exp so the token is never never-expiring', async () => {
    const token = await signJWT({ userId: 'm1' }, '30m')
    const decoded = jwt.decode(token) as Record<string, unknown>

    expect(typeof decoded.exp).toBe('number')
    expect(decoded.exp as number).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('produces a token the same secret verifies under HS256', async () => {
    const token = await signJWT({ userId: 'm1' })
    // jsonwebtoken validates iss/aud only when asked — pin both here to prove
    // the stamped claims match what the admin API will expect.
    const verified = jwt.verify(token, 'unit-test-secret', {
      algorithms: ['HS256'],
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    }) as Record<string, unknown>

    expect(verified.userId).toBe('m1')
  })
})
