import neo4j, { Driver, Session } from 'neo4j-driver'
import { getSecret } from '../utils/secrets'

let driver: Driver | null = null

export async function initializeDB(): Promise<Driver> {
  if (driver) {
    return driver
  }

  try {
    let uri = await getSecret('NEO4J_URI')
    const user = await getSecret('NEO4J_USER')
    const password = await getSecret('NEO4J_PASSWORD')

    // Convert neo4j:// to bolt:// to use direct connection instead of cluster routing
    // This prevents "No routing servers available" errors on single instances
    if (uri.startsWith('neo4j://')) {
      uri = uri.replace('neo4j://', 'bolt://')
    }

    console.log('Connecting to Neo4j at:', uri)

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 10000,
    })

    // Verify connection works
    try {
      await driver.verifyAuthentication()
      console.log('Successfully connected to Neo4j database')
    } catch (error) {
      console.error('Failed to connect to Neo4j:', error)
      await driver.close()
      driver = null
      throw error
    }

    return driver
  } catch (error) {
    console.error('Failed to initialize database:', error)
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
    await driver.close()
    driver = null
  }
}
