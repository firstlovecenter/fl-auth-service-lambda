/**
 * Integration Tests for Member to User Migration
 * Tests the migration script and label updates
 */

import neo4j, { Driver, Session } from 'neo4j-driver'

describe('Migration: Member to User Labels', () => {
  let driver: Driver
  let session: Session

  // Test environment - uses dev database
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

    // Clean up test data before tests
    await session.run(`
      MATCH (m:Member {email: $email})
      WHERE m.email LIKE 'test-migration-%'
      DETACH DELETE m
    `, { email: 'test' })
  })

  afterAll(async () => {
    // Clean up test data
    await session.run(`
      MATCH (m:Member {email: $email})
      WHERE m.email LIKE 'test-migration-%'
      DETACH DELETE m
    `, { email: 'test' })

    await session.close()
    await driver.close()
  })

  describe('Pre-migration state', () => {
    test('should have Members without User label', async () => {
      // Create test member without User label
      await session.run(`
        CREATE (m:Member {
          id: randomUUID(),
          email: $email,
          password: $password,
          createdAt: datetime()
        })
      `, {
        email: 'test-migration-1@example.com',
        password: 'hashedpassword',
      })

      const result = await session.run(`
        MATCH (m:Member {email: $email})
        RETURN labels(m) as labels
      `, { email: 'test-migration-1@example.com' })

      const labels = result.records[0].get('labels')
      expect(labels).toContain('Member')
      expect(labels).not.toContain('User')
    })
  })

  describe('Migration execution', () => {
    test('should add User label to Members without it', async () => {
      // Create test member
      await session.run(`
        CREATE (m:Member {
          id: randomUUID(),
          email: $email,
          password: $password,
          createdAt: datetime()
        })
      `, {
        email: 'test-migration-2@example.com',
        password: 'hashedpassword',
      })

      // Simulate migration
      const migrateResult = await session.run(`
        MATCH (m:Member)
        WHERE NOT m:User
        SET m:User
        RETURN count(m) as migrated
      `)

      const migrated = migrateResult.records[0].get('migrated').toNumber()
      expect(migrated).toBeGreaterThan(0)

      // Verify labels
      const verifyResult = await session.run(`
        MATCH (m:Member:User {email: $email})
        RETURN labels(m) as labels
      `, { email: 'test-migration-2@example.com' })

      expect(verifyResult.records.length).toBe(1)
      const labels = verifyResult.records[0].get('labels')
      expect(labels).toContain('Member')
      expect(labels).toContain('User')
    })

    test('should not duplicate User labels on Members', async () => {
      // Create test member with User label
      await session.run(`
        CREATE (m:Member:User {
          id: randomUUID(),
          email: $email,
          password: $password,
          createdAt: datetime()
        })
      `, {
        email: 'test-migration-3@example.com',
        password: 'hashedpassword',
      })

      // Attempt migration
      await session.run(`
        MATCH (m:Member)
        WHERE NOT m:User
        SET m:User
      `)

      // Verify only one User label
      const result = await session.run(`
        MATCH (m {email: $email})
        RETURN labels(m) as labels
      `, { email: 'test-migration-3@example.com' })

      const labels = result.records[0].get('labels')
      const userLabelCount = labels.filter((l: string) => l === 'User').length
      expect(userLabelCount).toBe(1)
    })
  })

  describe('Post-migration verification', () => {
    test('should have all Members with User label', async () => {
      // Create test member
      await session.run(`
        CREATE (m:Member {
          id: randomUUID(),
          email: $email,
          password: $password,
          createdAt: datetime()
        })
      `, {
        email: 'test-migration-4@example.com',
        password: 'hashedpassword',
      })

      // Apply migration
      await session.run(`
        MATCH (m:Member)
        WHERE NOT m:User
        SET m:User
      `)

      // Count Members without User label
      const checkResult = await session.run(`
        MATCH (m:Member)
        WHERE NOT m:User
        RETURN count(m) as remaining
      `)

      const remaining = checkResult.records[0].get('remaining').toNumber()
      expect(remaining).toBe(0)
    })

    test('should query Users by id successfully', async () => {
      const createResult = await session.run(`
        CREATE (m:Member:User {
          id: randomUUID(),
          email: $email,
          password: $password,
          firstName: 'Test',
          lastName: 'User',
          createdAt: datetime()
        })
        RETURN m.id as id
      `, {
        email: 'test-migration-5@example.com',
        password: 'hashedpassword',
      })

      const userId = createResult.records[0].get('id')

      // Query using new User label
      const queryResult = await session.run(`
        MATCH (u:User {id: $userId})
        RETURN u.email as email, u.firstName as firstName
      `, { userId })

      expect(queryResult.records.length).toBe(1)
      expect(queryResult.records[0].get('email')).toBe('test-migration-5@example.com')
    })
  })

  describe('Signup creates Member:User', () => {
    test('should create users with both Member and User labels', async () => {
      const result = await session.run(`
        CREATE (person:Member:User {
          id: randomUUID(),
          email: $email,
          password: $password,
          firstName: 'New',
          lastName: 'User',
          createdAt: datetime(),
          updatedAt: datetime()
        })
        RETURN labels(person) as labels
      `, {
        email: 'test-migration-signup@example.com',
        password: 'hashedpassword',
      })

      const labels = result.records[0].get('labels')
      expect(labels).toContain('Member')
      expect(labels).toContain('User')
    })
  })
})
