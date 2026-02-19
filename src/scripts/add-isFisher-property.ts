import dotenv from 'dotenv'
import { getSession, initializeDB } from '../db/neo4j'

// Load environment variables from .env file
dotenv.config()

/**
 * Script to add isFisher property to all existing users in the database
 * This migration script sets isFisher to false by default for all users
 *
 * Usage: npx ts-node src/scripts/add-isFisher-property.ts
 *
 * What it does:
 * 1. Finds all User nodes that don't have the isFisher property
 * 2. Sets isFisher = false (default value)
 * 3. Reports the number of users updated
 *
 * Notes:
 * - This is safe to run multiple times (idempotent)
 * - Users who already have isFisher property are not affected
 * - The fisher role will only be assigned if isFisher is explicitly set to true
 */

async function addIsFisherProperty() {
  let session
  let driver

  try {
    console.log('[Migration] Starting isFisher property migration')

    // Initialize database connection
    driver = await initializeDB()
    session = getSession()

    // Get count of users without isFisher property
    const countResult = await session.run(
      'MATCH (u:User) WHERE NOT EXISTS(u.isFisher) RETURN count(u) as total',
    )
    const usersToUpdate = countResult.records[0].get('total').toNumber()
    console.log(
      `[Migration] Found ${usersToUpdate} users without isFisher property`,
    )

    if (usersToUpdate === 0) {
      console.log('[Migration] All users already have isFisher property')
      process.exit(0)
    }

    // Update users without isFisher property
    const updateResult = await session.run(
      `MATCH (u:User) 
       WHERE NOT EXISTS(u.isFisher)
       SET u.isFisher = false
       RETURN count(u) as updated`,
    )
    const updatedCount = updateResult.records[0].get('updated').toNumber()
    console.log(`[Migration] Successfully updated ${updatedCount} users`)

    // Verify the update
    const verifyResult = await session.run(
      `MATCH (u:User) 
       WHERE u.isFisher = false
       RETURN count(u) as falseCount`,
    )
    const falseCount = verifyResult.records[0].get('falseCount').toNumber()
    console.log(
      `[Migration] Verification: ${falseCount} users have isFisher = false`,
    )

    const allUsersResult = await session.run(
      'MATCH (u:User) RETURN count(u) as total',
    )
    const totalUsers = allUsersResult.records[0].get('total').toNumber()
    console.log(`[Migration] Total users in database: ${totalUsers}`)

    console.log(
      '[Migration] isFisher property migration completed successfully',
    )
    process.exit(0)
  } catch (error) {
    console.error('[Migration] Error during migration:', error)
    process.exit(1)
  } finally {
    if (session) {
      await session.close()
    }
    if (driver) {
      await driver.close()
    }
  }
}

// Run the migration
addIsFisherProperty()
