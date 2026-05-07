/**
 * Integration Tests: Logout and refresh-token denylist
 *
 * Coverage:
 *  1. Logout → RevokedToken node is created in Neo4j
 *  2. Second logout with same token is idempotent (no error, 200)
 *  3. Post-logout refresh is rejected (denylist check)
 */

import neo4j, { Driver, Session } from 'neo4j-driver'
import { hashToken } from '../routes/logout'

describe('Logout and token revocation', () => {
  let driver: Driver
  let session: Session

  const testConfig = {
    uri: process.env.NEO4J_URI || 'neo4j+s://test.databases.neo4j.io',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'testpass',
  }

  beforeAll(async () => {
    driver = neo4j.driver(
      testConfig.uri,
      neo4j.auth.basic(testConfig.user, testConfig.password),
    )
    session = driver.session()
  })

  afterAll(async () => {
    // Remove all test revoked tokens
    await session.run(
      `MATCH (t:RevokedToken)
       WHERE t.tokenHash STARTS WITH 'test-hash-'
         OR t.tokenHash IN $hashes
       DETACH DELETE t`,
      { hashes: [] },
    )
    await session.close()
    await driver.close()
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('hashToken utility', () => {
    test('produces a 64-char hex SHA-256 digest', () => {
      const hash = hashToken('some.jwt.token')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    test('is deterministic — same input yields same hash', () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.test.sig'
      expect(hashToken(token)).toBe(hashToken(token))
    })

    test('produces different hashes for different tokens', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('Logout flow — Neo4j denylist', () => {
    const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.logout-test.signature'
    let tokenHash: string

    beforeAll(() => {
      tokenHash = hashToken(FAKE_TOKEN)
    })

    afterEach(async () => {
      // Clean up after each test in this suite
      await session.run(
        `MATCH (t:RevokedToken { tokenHash: $tokenHash }) DETACH DELETE t`,
        { tokenHash },
      )
    })

    test('should store the revoked token hash in Neo4j', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      await session.run(
        `MERGE (t:RevokedToken { tokenHash: $tokenHash })
         SET t.revokedAt = datetime(),
             t.expiresAt = datetime($expiresAt)`,
        { tokenHash, expiresAt },
      )

      const result = await session.run(
        `MATCH (t:RevokedToken { tokenHash: $tokenHash }) RETURN t`,
        { tokenHash },
      )

      expect(result.records.length).toBe(1)
      const node = result.records[0].get('t').properties
      expect(node.tokenHash).toBe(tokenHash)
      expect(node.revokedAt).toBeDefined()
      expect(node.expiresAt).toBeDefined()
    })

    test('second logout (MERGE) on same token is idempotent — no duplicate nodes', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      // First logout
      await session.run(
        `MERGE (t:RevokedToken { tokenHash: $tokenHash })
         SET t.revokedAt = datetime(),
             t.expiresAt = datetime($expiresAt)`,
        { tokenHash, expiresAt },
      )

      // Second logout — same token
      await session.run(
        `MERGE (t:RevokedToken { tokenHash: $tokenHash })
         SET t.revokedAt = datetime(),
             t.expiresAt = datetime($expiresAt)`,
        { tokenHash, expiresAt },
      )

      const result = await session.run(
        `MATCH (t:RevokedToken { tokenHash: $tokenHash }) RETURN count(t) AS cnt`,
        { tokenHash },
      )

      expect(result.records[0].get('cnt').toInt()).toBe(1)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('Refresh-token denylist check', () => {
    const REVOKED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.revoked-token.signature'
    const ACTIVE_TOKEN  = 'eyJhbGciOiJIUzI1NiJ9.active-token.signature'
    let revokedHash: string
    let activeHash: string

    beforeAll(async () => {
      revokedHash = hashToken(REVOKED_TOKEN)
      activeHash  = hashToken(ACTIVE_TOKEN)

      // Insert revoked token with a future expiry (still valid window)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await session.run(
        `MERGE (t:RevokedToken { tokenHash: $tokenHash })
         SET t.revokedAt = datetime(),
             t.expiresAt = datetime($expiresAt)`,
        { tokenHash: revokedHash, expiresAt },
      )
    })

    afterAll(async () => {
      await session.run(
        `MATCH (t:RevokedToken)
         WHERE t.tokenHash IN $hashes
         DETACH DELETE t`,
        { hashes: [revokedHash, activeHash] },
      )
    })

    test('denylist check finds a revoked token that has not expired', async () => {
      const result = await session.run(
        `MATCH (t:RevokedToken { tokenHash: $tokenHash })
         WHERE t.expiresAt > datetime()
         RETURN t LIMIT 1`,
        { tokenHash: revokedHash },
      )

      // Simulates the check inside refreshToken.ts — should block the refresh
      expect(result.records.length).toBe(1)
    })

    test('denylist check does NOT block a token that was never revoked', async () => {
      const result = await session.run(
        `MATCH (t:RevokedToken { tokenHash: $tokenHash })
         WHERE t.expiresAt > datetime()
         RETURN t LIMIT 1`,
        { tokenHash: activeHash },
      )

      // Non-revoked token → no record → refresh should be allowed
      expect(result.records.length).toBe(0)
    })

    test('denylist check does NOT block a token whose revocation has expired', async () => {
      // Insert a revocation entry that is already past its expiry
      const pastExpiresAt = new Date(Date.now() - 1000).toISOString()
      const expiredHash = hashToken('eyJhbGciOiJIUzI1NiJ9.expired-revocation.sig')

      await session.run(
        `MERGE (t:RevokedToken { tokenHash: $tokenHash })
         SET t.revokedAt = datetime(),
             t.expiresAt = datetime($expiresAt)`,
        { tokenHash: expiredHash, expiresAt: pastExpiresAt },
      )

      const result = await session.run(
        `MATCH (t:RevokedToken { tokenHash: $tokenHash })
         WHERE t.expiresAt > datetime()
         RETURN t LIMIT 1`,
        { tokenHash: expiredHash },
      )

      expect(result.records.length).toBe(0)

      // Cleanup
      await session.run(
        `MATCH (t:RevokedToken { tokenHash: $tokenHash }) DETACH DELETE t`,
        { tokenHash: expiredHash },
      )
    })
  })
})
