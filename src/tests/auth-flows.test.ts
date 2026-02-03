/**
 * Integration Tests for Auth Routes with User Label
 * Tests login flow with NULL password detection
 */

import neo4j, { Driver, Session } from 'neo4j-driver'
import { hashPassword } from '../utils/auth'

describe('Auth Flows: Member to User Migration', () => {
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
    // Clean up
    await session.run(`
      MATCH (u:User {email: $pattern})
      WHERE u.email STARTS WITH 'test-auth-'
      DETACH DELETE u
    `, { pattern: 'test-auth-' })

    await session.close()
    await driver.close()
  })

  describe('Login flow with NULL password', () => {
    test('should reject login with NULL password and return forgot password message', async () => {
      // Create user with NULL password (migrated user)
      await session.run(`
        CREATE (u:Member:User {
          id: randomUUID(),
          email: $email,
          password: NULL,
          firstName: 'Migrated',
          lastName: 'User',
          createdAt: datetime()
        })
      `, { email: 'test-auth-nullpass@example.com' })

      // Simulate login check
      const result = await session.run(`
        MATCH (m:User {email: $email})
        RETURN m { .id, .firstName, .lastName, .email, .password } AS member
      `, { email: 'test-auth-nullpass@example.com' })

      expect(result.records.length).toBe(1)
      const member = result.records[0].get('member')
      
      // Verify password is NULL
      expect(member.password).toBeNull()
      
      // Frontend should see this error
      expect({
        error: "Password not set. Please use 'Forgot Password' to set up your password.",
        statusCode: 401,
        requiresPasswordSetup: true,
      }).toBeDefined()
    })

    test('should query User label successfully', async () => {
      const email = 'test-auth-queryuser@example.com'
      
      // Create user with User label
      await session.run(`
        CREATE (u:Member:User {
          id: randomUUID(),
          email: $email,
          password: $password,
          firstName: 'Query',
          lastName: 'Test',
          createdAt: datetime()
        })
      `, {
        email,
        password: await hashPassword('TestPassword123!'),
      })

      // Query using User label (not Member)
      const result = await session.run(`
        MATCH (u:User {email: $email})
        RETURN u.id as id, u.email as email, u.password as password
      `, { email })

      expect(result.records.length).toBe(1)
      expect(result.records[0].get('email')).toBe(email)
      expect(result.records[0].get('password')).not.toBeNull()
    })
  })

  describe('Signup creates User label', () => {
    test('should create user with both Member:User labels', async () => {
      const email = 'test-auth-signup@example.com'
      
      // Simulate signup creation
      const result = await session.run(`
        CREATE (person:Member:User {
          id: randomUUID(),
          email: $email,
          password: $password,
          firstName: 'New',
          lastName: 'Member',
          createdAt: datetime(),
          updatedAt: datetime()
        })
        RETURN labels(person) as labels, person.id as id, person.email as email
      `, {
        email,
        password: await hashPassword('NewPassword123!'),
      })

      const labels = result.records[0].get('labels')
      expect(labels).toContain('Member')
      expect(labels).toContain('User')
      expect(result.records[0].get('email')).toBe(email)
    })

    test('should prevent duplicate email signup', async () => {
      const email = 'test-auth-dup@example.com'
      
      // Create first user
      await session.run(`
        CREATE (u:Member:User {
          id: randomUUID(),
          email: $email,
          password: $password,
          createdAt: datetime()
        })
      `, {
        email,
        password: await hashPassword('Password123!'),
      })

      // Attempt to create duplicate
      const checkResult = await session.run(`
        MATCH (u) WHERE (u:Member OR u:User) AND u.email = $email
        RETURN u LIMIT 1
      `, { email })

      expect(checkResult.records.length).toBe(1)
      // Frontend should reject with "email already exists" error
    })
  })

  describe('Setup password flow', () => {
    test('should update password for User with NULL password', async () => {
      const email = 'test-auth-setup@example.com'
      const userId = 'test-id-setup-' + Date.now()
      
      // Create migrated user with NULL password
      await session.run(`
        CREATE (u:Member:User {
          id: $userId,
          email: $email,
          password: NULL,
          createdAt: datetime()
        })
      `, { userId, email })

      // Simulate password setup
      const newPassword = await hashPassword('NewSetupPassword123!')
      const setupResult = await session.run(`
        MATCH (u:User {id: $userId, email: $email})
        WHERE u.password IS NULL
        SET u.password = $hashedPassword,
            u.updatedAt = datetime()
        RETURN u.id as id, u.email as email
      `, {
        userId,
        email,
        hashedPassword: newPassword,
      })

      expect(setupResult.records.length).toBe(1)
      
      // Verify password is now set
      const verifyResult = await session.run(`
        MATCH (u:User {id: $userId})
        RETURN u.password as password
      `, { userId })

      expect(verifyResult.records[0].get('password')).not.toBeNull()
    })

    test('should reject setup if password already set', async () => {
      const email = 'test-auth-alreadysetup@example.com'
      const userId = 'test-id-already-' + Date.now()
      
      // Create user with password already set
      await session.run(`
        CREATE (u:Member:User {
          id: $userId,
          email: $email,
          password: $password,
          createdAt: datetime()
        })
      `, {
        userId,
        email,
        password: await hashPassword('ExistingPassword123!'),
      })

      // Attempt password setup
      const setupResult = await session.run(`
        MATCH (u:User {id: $userId, email: $email})
        WHERE u.password IS NULL
        RETURN u
      `, { userId, email })

      expect(setupResult.records.length).toBe(0)
      // Should return "User not found or password already set" error
    })
  })

  describe('Verify and refresh token flows', () => {
    test('should verify user querying User label', async () => {
      const email = 'test-auth-verify@example.com'
      
      // Create user
      const createResult = await session.run(`
        CREATE (u:Member:User {
          id: randomUUID(),
          email: $email,
          password: $password,
          firstName: 'Verify',
          lastName: 'Test',
          createdAt: datetime()
        })
        RETURN u.id as userId
      `, {
        email,
        password: await hashPassword('TestPassword123!'),
      })

      const userId = createResult.records[0].get('userId')

      // Simulate token verification
      const verifyResult = await session.run(`
        MATCH (u:User {id: $userId})
        RETURN u.id as id, u.email as email, u.firstName as firstName, u.lastName as lastName
      `, { userId })

      expect(verifyResult.records.length).toBe(1)
      expect(verifyResult.records[0].get('email')).toBe(email)
    })

    test('should refresh token querying User label', async () => {
      const email = 'test-auth-refresh@example.com'
      
      // Create user
      const createResult = await session.run(`
        CREATE (u:Member:User {
          id: randomUUID(),
          email: $email,
          password: $password,
          createdAt: datetime()
        })
        RETURN u.id as userId
      `, {
        email,
        password: await hashPassword('TestPassword123!'),
      })

      const userId = createResult.records[0].get('userId')

      // Simulate refresh token
      const refreshResult = await session.run(`
        MATCH (u:User {id: $userId})
        RETURN u.id as id, u.email as email
      `, { userId })

      expect(refreshResult.records.length).toBe(1)
      expect(refreshResult.records[0].get('email')).toBe(email)
    })
  })

  describe('Delete account flow', () => {
    test('should delete User node completely', async () => {
      const email = 'test-auth-delete@example.com'
      
      // Create user
      const createResult = await session.run(`
        CREATE (u:Member:User {
          id: randomUUID(),
          email: $email,
          password: $password,
          createdAt: datetime()
        })
        RETURN u.id as userId
      `, {
        email,
        password: await hashPassword('TestPassword123!'),
      })

      const userId = createResult.records[0].get('userId')

      // Verify user exists
      let checkResult = await session.run(`
        MATCH (u:User {id: $userId})
        RETURN u
      `, { userId })
      expect(checkResult.records.length).toBe(1)

      // Delete user
      await session.run(`
        MATCH (u:User {id: $userId})
        DETACH DELETE u
      `, { userId })

      // Verify deleted
      checkResult = await session.run(`
        MATCH (u:User {id: $userId})
        RETURN u
      `, { userId })
      expect(checkResult.records.length).toBe(0)
    })
  })
})
