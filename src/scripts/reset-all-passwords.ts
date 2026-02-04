import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { getSession, initializeDB } from '../db/neo4j'
import { loadSecrets } from '../utils/secrets'

// Load environment variables from .env file
dotenv.config()

/**
 * Script to reset ALL users' passwords to a default password with proper hashing and pepper
 * Usage: npx ts-node src/scripts/reset-all-passwords.ts <newPassword>
 */

async function resetAllPasswords(newPassword: string) {
  let session
  let driver

  try {
    console.log('[Password Reset] Starting password reset for ALL users')

    // Load secrets from AWS Secrets Manager
    const secrets = await loadSecrets()
    const pepper = secrets.PEPPER
    console.log('[Password Reset] Pepper retrieved from AWS Secrets Manager')

    // Initialize database connection
    driver = await initializeDB()
    session = getSession()

    // Hash the new password with pepper (bcrypt handles salt automatically)
    const hashedPassword = await bcrypt.hash(newPassword + pepper, 12)
    console.log('[Password Reset] Password hashed with bcrypt (rounds: 12)')

    // Get count of all users first
    const countResult = await session.run('MATCH (u:User) RETURN count(u) as total')
    const totalUsers = countResult.records[0].get('total').toNumber()
    console.log(`[Password Reset] Found ${totalUsers} users in database`)

    if (totalUsers === 0) {
      console.log('[Password Reset] No users found in database')
      process.exit(0)
    }

    // Ask for confirmation
    console.log(`[Password Reset] About to reset passwords for ${totalUsers} users`)
    console.log('[Password Reset] Proceeding in 2 seconds...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Update all users' passwords
    const result = await session.run(
      `MATCH (u:User)
       SET u.password = $password,
           u.updatedAt = datetime()
       RETURN u.id, u.email`,
      { password: hashedPassword }
    )

    console.log(`[Password Reset] ✓ Successfully reset passwords for ${result.records.length} users:`)
    result.records.forEach((record, index) => {
      const userId = record.get('u.id')
      const userEmail = record.get('u.email')
      console.log(`  ${index + 1}. ${userEmail} (${userId})`)
    })

    console.log('[Password Reset] All passwords are now active')

  } catch (error) {
    console.error('[Password Reset] Error resetting passwords:', error)
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

// Get password from command line arguments
const newPassword = process.argv[2]

if (!newPassword) {
  console.error('Usage: npx ts-node src/scripts/reset-all-passwords.ts <newPassword>')
  console.error('Example: npx ts-node src/scripts/reset-all-passwords.ts password')
  process.exit(1)
}

resetAllPasswords(newPassword)
