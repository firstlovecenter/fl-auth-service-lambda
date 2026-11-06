import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getSession, initializeDB, closeDriver } from '../db/neo4j'

dotenv.config()

/**
 * Registers (or re-registers) an external-SSO client (SSO_SPEC 2.1).
 * Usage: npx ts-node src/scripts/seed-external-client.ts <clientId> <name> <redirectUri...>
 * Example: npx ts-node src/scripts/seed-external-client.ts camp-app "Camp App" https://camp.firstlovecenter.com/auth/callback
 *
 * Prints the plaintext client_secret ONCE — give it to the client app's team
 * to store in their own backend secrets. FLC only ever keeps the bcrypt hash.
 */
async function seedExternalClient(
  clientId: string,
  name: string,
  redirectUris: string[],
) {
  let session
  try {
    const clientSecret = crypto.randomBytes(32).toString('base64url')
    const clientSecretHash = await bcrypt.hash(clientSecret, 12)

    await initializeDB()
    session = getSession()

    await session.run(
      `MERGE (c:ExternalClient {clientId: $clientId})
       ON CREATE SET c.createdAt = datetime()
       SET c.clientSecretHash = $clientSecretHash,
           c.redirectUris = $redirectUris,
           c.name = $name,
           c.active = true,
           c.updatedAt = datetime()`,
      { clientId, clientSecretHash, redirectUris, name },
    )

    console.log(`[Seed External Client] Registered "${clientId}" (${name})`)
    console.log(`[Seed External Client] Redirect URIs: ${redirectUris.join(', ')}`)
    console.log('')
    console.log('client_secret (shown once — store in the client app\'s backend secrets, NEVER commit it):')
    console.log(clientSecret)
  } catch (error) {
    console.error('[Seed External Client] Error:', error)
    process.exit(1)
  } finally {
    if (session) await session.close()
    await closeDriver()
  }
}

const [clientId, name, ...redirectUris] = process.argv.slice(2)

if (!clientId || !name || redirectUris.length === 0) {
  console.error(
    'Usage: npx ts-node src/scripts/seed-external-client.ts <clientId> <name> <redirectUri...>',
  )
  process.exit(1)
}

seedExternalClient(clientId, name, redirectUris)
