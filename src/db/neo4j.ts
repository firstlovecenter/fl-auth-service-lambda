import neo4j, { Driver, Session } from 'neo4j-driver'

let driver: Driver | null = null

export async function initializeDB(): Promise<Driver> {
  if (driver) {
    return driver
  }

  const uri = process.env.NEO4J_URI || 'neo4j://localhost:7687'
  const user = process.env.NEO4J_USER || 'neo4j'
  const password = process.env.NEO4J_PASSWORD || 'password'

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
