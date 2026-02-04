import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { getSession, initializeDB } from '../db/neo4j'
import { loadSecrets } from '../utils/secrets'

// Load environment variables from .env file
dotenv.config()

/**
 * Script to reset a user's password with proper hashing and pepper
 * Usage: npx ts-node src/scripts/reset-password.ts <email> <newPassword>
 */

async function resetPasswordForUser(email: string, newPassword: string) {
  let session
  let driver

  try {
    console.log(`[Password Reset] Starting password reset for ${email}`)

    // Load secrets from AWS Secrets Manager
    const secrets = await loadSecrets()
    const pepper = secrets.PEPPER
    console.log('[Password Reset] Pepper retrieved from AWS Secrets Manager')

    // Initialize database connection
    driver = await initializeDB()
    session = getSession()

    // Hash the new password with pepper
    const hashedPassword = await bcrypt.hash(newPassword + pepper, 12)
    console.log('[Password Reset] Password hashed with bcrypt (rounds: 12)')

    // Find and update the user
    const result = await session.run(
      `MATCH (u:User {email: $email})
       SET u.password = $password,
           u.updatedAt = datetime()
       RETURN u.id, u.email`,
      { email, password: hashedPassword }
    )

    if (result.records.length === 0) {
      console.error(`[Password Reset] User not found with email: ${email}`)
      process.exit(1)
    }

    const record = result.records[0]
    const userId = record.get('u.id')
    const userEmail = record.get('u.email')

    console.log(`[Password Reset] ✓ Password successfully reset for user ${userId} (${userEmail})`)
    console.log('[Password Reset] New password is now active')

  } catch (error) {
    console.error('[Password Reset] Error resetting password:', error)
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

// Get email and password from command line arguments
const email = process.argv[2]
const newPassword = process.argv[3]

if (!email || !newPassword) {
  console.error('Usage: npx ts-node src/scripts/reset-password.ts <email> <newPassword>')
  console.error('Example: npx ts-node src/scripts/reset-password.ts campusadmin@test.com password')
  process.exit(1)
}

resetPasswordForUser(email, newPassword)
