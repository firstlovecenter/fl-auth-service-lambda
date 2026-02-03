#!/usr/bin/env ts-node

/**
 * Migration Script: Add User Label to Member Nodes
 * 
 * This script adds the :User label to all :Member nodes in the database.
 * This migration is part of the authentication system refactor where:
 * - All Members get the :User label
 * - Auth routes will query :User nodes instead of :Member
 * - Signup creates both :Member and :User labels
 * 
 * Usage:
 *   # Dry run (no changes, just report)
 *   npm run migrate:members-to-users -- --dry-run
 * 
 *   # Run on development database
 *   npm run migrate:members-to-users -- --environment development
 * 
 *   # Run on production database
 *   npm run migrate:members-to-users -- --environment production
 * 
 *   # Dry run on dev
 *   npm run migrate:members-to-users -- --environment development --dry-run
 */

import neo4j, { Driver, Session } from 'neo4j-driver'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'

interface MigrationStats {
  totalMembers: number
  membersWithUserLabel: number
  membersWithoutUserLabel: number
  migrated: number
  errors: number
}

interface Secrets {
  NEO4J_URI: string
  NEO4J_USER: string
  NEO4J_PASSWORD: string
  ENVIRONMENT: string
}

/**
 * Load secrets from AWS Secrets Manager
 */
async function loadSecrets(environment: string): Promise<Secrets> {
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'eu-west-2',
  })

  const secretName =
    environment === 'development'
      ? 'dev-fl-auth-service-secrets'
      : 'fl-auth-service-secrets'

  console.log(`📦 Loading secrets from: ${secretName}`)

  const command = new GetSecretValueCommand({ SecretId: secretName })
  const response = await client.send(command)

  if (!response.SecretString) {
    throw new Error('No secret string found in Secrets Manager')
  }

  return JSON.parse(response.SecretString) as Secrets
}

/**
 * Create Neo4j driver instance
 */
function createDriver(secrets: Secrets): Driver {
  return neo4j.driver(
    secrets.NEO4J_URI,
    neo4j.auth.basic(secrets.NEO4J_USER, secrets.NEO4J_PASSWORD),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 60000,
    },
  )
}

/**
 * Get migration statistics
 */
async function getMigrationStats(session: Session): Promise<MigrationStats> {
  // Count total Members
  const totalResult = await session.run(`
    MATCH (m:Member)
    RETURN count(m) as total
  `)
  const totalMembers = totalResult.records[0].get('total').toNumber()

  // Count Members that already have User label
  const withUserResult = await session.run(`
    MATCH (m:Member:User)
    RETURN count(m) as total
  `)
  const membersWithUserLabel = withUserResult.records[0].get('total').toNumber()

  // Count Members without User label
  const withoutUserResult = await session.run(`
    MATCH (m:Member)
    WHERE NOT m:User
    RETURN count(m) as total
  `)
  const membersWithoutUserLabel = withoutUserResult.records[0].get('total').toNumber()

  return {
    totalMembers,
    membersWithUserLabel,
    membersWithoutUserLabel,
    migrated: 0,
    errors: 0,
  }
}

/**
 * Get sample records that will be migrated
 */
async function getSampleRecords(session: Session, limit: number = 5) {
  const result = await session.run(
    `
    MATCH (m:Member)
    WHERE NOT m:User
    RETURN m.id as id, m.email as email, labels(m) as labels
    LIMIT $limit
  `,
    { limit },
  )

  return result.records.map((record) => ({
    id: record.get('id'),
    email: record.get('email'),
    labels: record.get('labels'),
  }))
}

/**
 * Perform the migration (add User label to all Members)
 */
async function performMigration(
  session: Session,
  dryRun: boolean,
): Promise<MigrationStats> {
  const stats = await getMigrationStats(session)

  if (stats.membersWithoutUserLabel === 0) {
    console.log('✅ No Members need migration. All Members already have :User label.')
    return stats
  }

  console.log(
    `\n📊 Found ${stats.membersWithoutUserLabel} Member(s) without :User label`,
  )

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n')
    const samples = await getSampleRecords(session, 10)
    console.log('Sample records that would be migrated:')
    samples.forEach((record, index) => {
      console.log(
        `  ${index + 1}. ${record.email} (${record.id}) - Labels: ${record.labels.join(', ')}`,
      )
    })
    return stats
  }

  console.log('\n🚀 Starting migration...\n')

  try {
    // Add :User label to all :Member nodes that don't have it
    const result = await session.run(`
      MATCH (m:Member)
      WHERE NOT m:User
      SET m:User
      RETURN count(m) as migrated
    `)

    stats.migrated = result.records[0].get('migrated').toNumber()

    console.log(`✅ Successfully migrated ${stats.migrated} Member(s) to User`)
  } catch (error) {
    stats.errors++
    console.error('❌ Migration failed:', error)
    throw error
  }

  return stats
}

/**
 * Verify migration results
 */
async function verifyMigration(session: Session): Promise<void> {
  console.log('\n🔍 Verifying migration...\n')

  // Check that all Members have User label
  const result = await session.run(`
    MATCH (m:Member)
    WHERE NOT m:User
    RETURN count(m) as remaining
  `)

  const remaining = result.records[0].get('remaining').toNumber()

  if (remaining === 0) {
    console.log('✅ Verification passed: All Members now have :User label')
  } else {
    console.log(`⚠️  Warning: ${remaining} Member(s) still don't have :User label`)
  }

  // Show some sample migrated records
  const sampleResult = await session.run(`
    MATCH (m:Member:User)
    RETURN m.id as id, m.email as email, labels(m) as labels
    LIMIT 5
  `)

  console.log('\nSample migrated records:')
  sampleResult.records.forEach((record, index) => {
    console.log(
      `  ${index + 1}. ${record.get('email')} - Labels: ${record.get('labels').join(', ')}`,
    )
  })

  // Show final counts
  const finalStats = await getMigrationStats(session)
  console.log('\n📊 Final Statistics:')
  console.log(`  Total Members: ${finalStats.totalMembers}`)
  console.log(`  Members with User label: ${finalStats.membersWithUserLabel}`)
  console.log(
    `  Members without User label: ${finalStats.membersWithoutUserLabel}`,
  )
}

/**
 * Main migration function
 */
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const envIndex = args.indexOf('--environment')
  const environment =
    envIndex !== -1 && args[envIndex + 1] ? args[envIndex + 1] : 'development'

  console.log('🔧 Member to User Migration Script')
  console.log('=====================================')
  console.log(`Environment: ${environment}`)
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log('=====================================\n')

  let driver: Driver | null = null
  let session: Session | null = null

  try {
    // Load secrets from AWS Secrets Manager
    const secrets = await loadSecrets(environment)

    // Verify environment matches
    if (secrets.ENVIRONMENT !== environment) {
      console.warn(
        `⚠️  Warning: Requested environment "${environment}" but secret contains "${secrets.ENVIRONMENT}"`,
      )
      console.warn('Proceeding with secret configuration...\n')
    }

    // Create Neo4j driver
    driver = createDriver(secrets)
    await driver.verifyConnectivity()
    console.log('✅ Connected to Neo4j database\n')

    // Create session
    session = driver.session()

    // Get initial stats
    const initialStats = await getMigrationStats(session)
    console.log('📊 Initial Statistics:')
    console.log(`  Total Members: ${initialStats.totalMembers}`)
    console.log(`  Members with User label: ${initialStats.membersWithUserLabel}`)
    console.log(
      `  Members without User label: ${initialStats.membersWithoutUserLabel}\n`,
    )

    // Perform migration
    const stats = await performMigration(session, dryRun)

    if (!dryRun && stats.migrated > 0) {
      // Verify results
      await verifyMigration(session)
    }

    // Summary
    console.log('\n' + '='.repeat(50))
    console.log('Migration Summary:')
    console.log('='.repeat(50))
    console.log(`Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'LIVE'}`)
    console.log(`Total Members: ${stats.totalMembers}`)
    console.log(
      `Migrated: ${dryRun ? stats.membersWithoutUserLabel : stats.migrated}`,
    )
    console.log(`Errors: ${stats.errors}`)
    console.log('='.repeat(50))

    if (dryRun) {
      console.log(
        '\n💡 This was a dry run. Run without --dry-run to perform actual migration.',
      )
    } else if (stats.migrated > 0) {
      console.log('\n✅ Migration completed successfully!')
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  } finally {
    // Cleanup
    if (session) {
      await session.close()
    }
    if (driver) {
      await driver.close()
    }
  }
}

// Run migration
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { main, getMigrationStats, performMigration }
