import neo4j, { Driver, Session } from 'neo4j-driver'
import { getSecret } from '../utils/secrets'

let driver: Driver | null = null
let isInitialized = false

const DEFAULT_NEO4J_CONFIG = {
  maxConnectionPoolSize: 50,
  connectionTimeout: 30000,
  logging: {
    level: 'info' as const,
    logger: (level: string, message: string) =>
      console.log(`[Neo4j ${level}] ${message}`),
  },
}

export async function initializeDB(): Promise<Driver> {
  if (isInitialized && driver) {
    return driver
  }

  console.log('[Neo4j] Starting database initialization')

  try {
    let uri = await getSecret('NEO4J_URI')
    const user = await getSecret('NEO4J_USER')
    const password = await getSecret('NEO4J_PASSWORD')

    // Handle encrypted connection if required
    const isEncrypted = uri.includes('neo4j+s://')
    console.log(
      `[Neo4j] Connecting to ${uri.replace(/:\/\/.*@/, '://[REDACTED]@')} (encrypted: ${isEncrypted})`
    )

    driver = neo4j.driver(
      uri,
      neo4j.auth.basic(user, password),
      DEFAULT_NEO4J_CONFIG
    )

    // Verify connection
    try {
      await driver.verifyConnectivity()
      console.log('[Neo4j] Connection established successfully')
      isInitialized = true
    } catch (error) {
      console.error('[Neo4j] Connection verification failed:', error)
      await driver.close().catch((err) =>
        console.error('[Neo4j] Error closing failed driver:', err)
      )
      driver = null
      isInitialized = false
      throw error
    }

    return driver
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
