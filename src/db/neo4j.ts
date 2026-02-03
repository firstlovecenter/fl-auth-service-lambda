import neo4j, { Driver, Session } from 'neo4j-driver'
import { getSecret } from '../utils/secrets'

let driver: Driver | null = null
let initializingPromise: Promise<Driver> | null = null

const RETRY_CONFIG = {
  maxRetries: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 10000,
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = RETRY_CONFIG.maxRetries
): Promise<T> {
  let lastError: Error | null = null

  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (i < retries - 1) {
        const backoffMs = Math.min(
          RETRY_CONFIG.initialBackoffMs * Math.pow(2, i),
          RETRY_CONFIG.maxBackoffMs
        )
        console.log(
          `Connection attempt ${i + 1} failed, retrying in ${backoffMs}ms...`,
          error instanceof Error ? error.message : String(error)
        )
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }
  }

  throw lastError
}

export async function initializeDB(): Promise<Driver> {
  if (driver) {
    return driver
  }

  // Prevent multiple concurrent initialization attempts
  if (initializingPromise) {
    return initializingPromise
  }

  initializingPromise = (async () => {
    try {
      let uri = await getSecret('NEO4J_URI')
      const user = await getSecret('NEO4J_USER')
      const password = await getSecret('NEO4J_PASSWORD')

      console.log('Connecting to Neo4j at:', uri)

      // Create driver with improved connection settings
      driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 30000, // Increased from 10s to 30s
        maxTransactionRetryTime: 15000,
        connectionTimeout: 30000, // Add connection timeout
        disableLosslessIntegers: true,
        // Keep-alive for long-lived connections
        trust: 'TRUST_ALL_CERTIFICATES',
      })

      // Verify connection works with retries
      await retryWithBackoff(async () => {
        try {
          await driver!.verifyAuthentication()
          console.log('Successfully connected to Neo4j database')
        } catch (error) {
          if (
            error instanceof Error &&
            error.message &&
            error.message.includes('ServiceUnavailable')
          ) {
            throw new Error('Neo4j database is unavailable')
          }
          throw error
        }
      })

      return driver
    } catch (error) {
      console.error('Failed to initialize database:', error)
      if (driver) {
        await driver.close().catch((err) =>
          console.error('Error closing failed driver:', err)
        )
        driver = null
      }
      throw error
    } finally {
      initializingPromise = null
    }
  })()

  return initializingPromise
}

export function getSession(): Session {
  if (!driver) {
    throw new Error('Database not initialized. Call initializeDB() first.')
  }

  return driver.session()
}

/**
 * Execute a query with automatic retry logic for transient failures
 */
export async function executeQuery<T>(
  query: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const session = getSession()

  try {
    return await retryWithBackoff(async () => {
      const result = await session.run(query, params)
      return result.records.map((record) => record.toObject()) as T[]
    })
  } finally {
    await session.close()
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    try {
      await driver.close()
    } catch (error) {
      console.error('Error closing driver:', error)
    }
    driver = null
  }
}
