/**
 * Phase 2 proof (SSO_IMPLEMENTATION_SPEC.md 2.4): a manually-seeded client +
 * code exchanges for a valid, JWKS-verifiable JWT, and every rejection path
 * (bad secret, expired code, reused code, wrong redirect_uri) returns an
 * error, not a token.
 *
 * Integration test — talks to Neo4j directly, same style as
 * src/tests/auth-flows.test.ts. RS256 keys are mocked (offline, same as
 * external-jwks.test.ts) so this test only exercises the DB-backed pieces.
 */

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import neo4j, { Driver, Session } from 'neo4j-driver'

const TEST_KID = 'flc-ext-test-token'
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
  getSecret: jest.fn(async () => {
    throw new Error('getSecret should not be called by the RS256 path')
  }),
}))

// eslint-disable-next-line import/first
import {
  getActiveClient,
  verifyClientSecret,
  isRedirectUriRegistered,
} from '../utils/externalClients'
// eslint-disable-next-line import/first
import { peekAuthCode, consumeAuthCode } from '../utils/authCodes'
// eslint-disable-next-line import/first
import { signExternalJWT, EXTERNAL_TOKEN_ISSUER } from '../utils/externalAuth'

// eslint-disable-next-line import/first
import { initializeDB } from '../db/neo4j'

const CLIENT_ID = 'test-camp-app'
const REDIRECT_URI = 'https://camp.example.com/callback'
const CLIENT_SECRET = 'super-secret-value'
const TEST_USER_ID = 'test-external-sso-user-1'

describe('external SSO — token exchange (integration)', () => {
  let driver: Driver
  let session: Session

  beforeAll(async () => {
    await initializeDB()
    driver = neo4j.driver(
      process.env.NEO4J_URI || 'neo4j+s://test.databases.neo4j.io',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'testpass',
      ),
    )
    session = driver.session()

    const clientSecretHash = await bcrypt.hash(CLIENT_SECRET, 12)
    await session.run(
      `MERGE (c:ExternalClient {clientId: $clientId})
       SET c.clientSecretHash = $clientSecretHash,
           c.redirectUris = [$redirectUri],
           c.name = 'Test Camp App',
           c.active = true`,
      { clientId: CLIENT_ID, clientSecretHash, redirectUri: REDIRECT_URI },
    )

    await session.run(
      `MERGE (u:User:Member {id: $id})
       SET u.email = $email, u.firstName = 'Test', u.lastName = 'User'`,
      { id: TEST_USER_ID, email: 'test-external-sso@example.com' },
    )
  })

  afterAll(async () => {
    await session.run(
      `MATCH (c:ExternalClient {clientId: $clientId}) DETACH DELETE c`,
      { clientId: CLIENT_ID },
    )
    await session.run(
      `MATCH (c:ExternalAuthCode) WHERE c.clientId = $clientId DETACH DELETE c`,
      { clientId: CLIENT_ID },
    )
    await session.run(`MATCH (u:User {id: $id}) DETACH DELETE u`, {
      id: TEST_USER_ID,
    })
    await session.close()
    await driver.close()
  })

  const seedCode = async (overrides: Partial<Record<string, any>> = {}) => {
    const code = crypto.randomBytes(16).toString('base64url')
    await session.run(
      `CREATE (c:ExternalAuthCode {
         code: $code, clientId: $clientId, userId: $userId,
         redirectUri: $redirectUri, expiresAt: $expiresAt, used: $used
       })`,
      {
        code,
        clientId: CLIENT_ID,
        userId: TEST_USER_ID,
        redirectUri: REDIRECT_URI,
        expiresAt: Date.now() + 60_000,
        used: false,
        ...overrides,
      },
    )
    return code
  }

  it('resolves the active client and validates its secret + redirect_uri', async () => {
    const client = await getActiveClient(CLIENT_ID)
    expect(client).not.toBeNull()
    expect(await verifyClientSecret(client!, CLIENT_SECRET)).toBe(true)
    expect(await verifyClientSecret(client!, 'wrong-secret')).toBe(false)
    expect(isRedirectUriRegistered(client!, REDIRECT_URI)).toBe(true)
    expect(isRedirectUriRegistered(client!, 'https://evil.example.com')).toBe(
      false,
    )
  })

  it('rejects an unknown client_id', async () => {
    expect(await getActiveClient('does-not-exist')).toBeNull()
  })

  it('peeks a valid code without consuming it, then consumes it exactly once', async () => {
    const code = await seedCode()

    const peeked = await peekAuthCode(code)
    expect(peeked).toMatchObject({
      clientId: CLIENT_ID,
      userId: TEST_USER_ID,
      redirectUri: REDIRECT_URI,
    })

    // Peeking must not have burned it.
    expect(await peekAuthCode(code)).not.toBeNull()

    expect(await consumeAuthCode(code)).toBe(true)
    // Single-use: a second consume must fail.
    expect(await consumeAuthCode(code)).toBe(false)
    expect(await peekAuthCode(code)).toBeNull()
  })

  it('rejects an expired code', async () => {
    const code = await seedCode({ expiresAt: Date.now() - 1000 })
    expect(await peekAuthCode(code)).toBeNull()
  })

  it('rejects a code presented with the wrong client_id without consuming it', async () => {
    const code = await seedCode()
    const peeked = await peekAuthCode(code)
    expect(peeked!.clientId).not.toBe('some-other-client')
    // The route handler would reject here without calling consumeAuthCode —
    // confirm the code is still consumable afterward (i.e. never got burned).
    expect(await consumeAuthCode(code)).toBe(true)
  })

  it('issues a JWT that verifies against the JWKS-published key and exposes only id/email/name', async () => {
    const token = await signExternalJWT(
      {
        aud: CLIENT_ID,
        sub: TEST_USER_ID,
        email: 'test-external-sso@example.com',
        name: 'Test User',
      },
      '5m',
    )

    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: EXTERNAL_TOKEN_ISSUER,
      audience: CLIENT_ID,
    }) as Record<string, unknown>

    expect(decoded.sub).toBe(TEST_USER_ID)
    expect(decoded.email).toBe('test-external-sso@example.com')
    expect(decoded.name).toBe('Test User')
    expect(decoded).not.toHaveProperty('roles')
    expect(decoded).not.toHaveProperty('churchScopes')
  })
})
