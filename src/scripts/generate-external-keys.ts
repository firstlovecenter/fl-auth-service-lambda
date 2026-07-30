import crypto from 'crypto'

/**
 * One-time RS256 key pair generator for external SSO (Phase 1).
 * Usage: npx ts-node src/scripts/generate-external-keys.ts [kid]
 *
 * Prints the private key, public key, and kid to stdout. These three values
 * must be added BY HAND as EXT_RS256_PRIVATE_KEY / EXT_RS256_PUBLIC_KEY /
 * EXT_RS256_KID to both the dev/fl-admin-portal and prod/fl-admin-portal
 * secrets in AWS Secrets Manager. Never commit the private key to git.
 */

const kid = process.argv[2] || `flc-ext-${new Date().toISOString().slice(0, 7)}`

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

console.log('kid:', kid)
console.log('\n--- EXT_RS256_PRIVATE_KEY (Secrets Manager only, never commit) ---\n')
console.log(privateKey)
console.log('--- EXT_RS256_PUBLIC_KEY (safe to be public) ---\n')
console.log(publicKey)

// The two blocks above have REAL line breaks — pasting them straight into a
// JSON secret value breaks the JSON (string values can't contain literal
// newlines, only the two-character escape `\n`). JSON.stringify() does that
// escaping for us, so this block below is paste-ready: merge these three
// lines directly into the existing secret JSON in Secrets Manager.
console.log('--- Paste directly into the Secrets Manager JSON (merge with existing keys) ---\n')
console.log(`  "EXT_RS256_PRIVATE_KEY": ${JSON.stringify(privateKey)},`)
console.log(`  "EXT_RS256_PUBLIC_KEY": ${JSON.stringify(publicKey)},`)
console.log(`  "EXT_RS256_KID": ${JSON.stringify(kid)}`)
