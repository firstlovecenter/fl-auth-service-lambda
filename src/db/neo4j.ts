import neo4j, { Driver, Session } from 'neo4j-driver'
import { getSecret } from '../utils/secrets'

let driver: Driver | null = null
let isInitialized = false

export async function initializeDB(): Promise<Driver> {
  if (isInitialized && driver) {
    return driver
  }

  console.log('[Neo4j] Starting database initialization')

  try {
    const uri = await getSecret('NEO4J_URI')
    const user = await getSecret('NEO4J_USER')
    const password = await getSecret('NEO4J_PASSWORD')

    // Get encryption setting from secrets (default to false for backward compatibility)
    let isEncrypted = false
    try {
      const encrypted = await getSecret('NEO4J_ENCRYPTED')
      isEncrypted = encrypted === 'true'
    } catch {
      // If not set, default to false
      isEncrypted = false
    }

    console.log(
      `[Neo4j] Connecting to ${uri.replace(/:\/\/.*@/, '://[REDACTED]@')} (encrypted: ${isEncrypted})`
    )

    // Configure driver options based on encryption setting
    const driverConfig = isEncrypted
      ? {
          encrypted: 'ENCRYPTION_ON' as const,
          trust: 'TRUST_ALL_CERTIFICATES' as const,
          connectionTimeout: 30000,
          maxConnectionPoolSize: 50,
          logging: {
            level: 'info' as const,
            logger: (level: string, message: string) =>
              console.log(`[Neo4j ${level}] ${message}`),
          },
        }
      : {
          connectionTimeout: 30000,
          maxConnectionPoolSize: 50,
          logging: {
            level: 'info' as const,
            logger: (level: string, message: string) =>
              console.log(`[Neo4j ${level}] ${message}`),
          },
        }

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), driverConfig)

    // Verify connection
    try {
      await driver.verifyConnectivity()
      console.log('[Neo4j] Connection verified successfully')

      // Test with a simple query to ensure full connectivity
      const session = driver.session()
      try {
        const result = await session.run('RETURN 1 as test')
        const testValue = result.records[0].get('test')
        console.log('[Neo4j] ✅ Test query successful:', testValue)
      } finally {
        await session.close()
      }

      isInitialized = true
      return driver
    } catch (error) {
      console.error('[Neo4j] ❌ Connection verification failed:', error)
      await driver.close().catch((err) =>
        console.error('[Neo4j] Error closing failed driver:', err)
      )
      driver = null
      isInitialized = false
      throw error
    }
  } catch (error) {
    console.error('[Neo4j] Database initialization failed:', error)
    isInitialized = false
    throw error
  }
}

export function getSession(): Session {
  if (!driver) {
    throw new Error('Database not initialized. Call initializeDB() first.')
  }

  return driver.session()
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    try {
      await driver.close()
    } catch (error) {
      console.error('[Neo4j] Error closing driver:', error)
    }
    driver = null
    isInitialized = false
  }
}
