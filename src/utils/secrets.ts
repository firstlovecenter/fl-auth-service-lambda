import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'

/**
 * Loads secrets from AWS Secrets Manager
 * This module handles fetching secrets from AWS Secrets Manager for use in the Lambda function
 * Caches secrets to avoid unnecessary API calls on subsequent invocations
 */

interface Secrets {
  JWT_SECRET: string
  PEPPER: string
  NEO4J_URI: string
  NEO4J_USER: string
  NEO4J_PASSWORD: string
  NEO4J_ENCRYPTED?: string
  NOTIFICATION_SECRET_KEY: string
  ENVIRONMENT: string
  FLC_NOTIFY_KEY: string
}

let secretsCache: Secrets | null = null

/**
 * Load secrets from AWS Secrets Manager
 * @returns {Secrets} - Object containing all required secrets
 */
export const loadSecrets = async (): Promise<Secrets> => {
  // Return cached secrets if available (useful for Lambda container reuse)
  if (secretsCache) {
    console.log('Using cached secrets from previous invocation')
    return secretsCache
  }

  try {
    // Create a Secrets Manager client
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'eu-west-2',
    })

    // Retrieve secrets from AWS Secrets Manager
    const secretName = process.env.AWS_SECRET_NAME || 'fl-auth-service-secrets'
    console.log(`Loading secrets from AWS Secrets Manager: ${secretName}`)

    const command = new GetSecretValueCommand({
      SecretId: secretName,
    })

    const response = await client.send(command)

    if (!response.SecretString) {
      throw new Error('SecretString not found in response')
    }

    // Parse the secret string into a JSON object
    secretsCache = JSON.parse(response.SecretString) as Secrets

    // Validate that all required secrets are present
    const requiredSecrets = ['JWT_SECRET', 'PEPPER', 'NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD']
    for (const secret of requiredSecrets) {
      if (!secretsCache[secret as keyof Secrets]) {
        throw new Error(`Missing required secret: ${secret}`)
      }
    }

    console.log('Successfully loaded secrets from AWS Secrets Manager')
    return secretsCache
  } catch (error) {
    console.error(
      'Failed to load secrets from AWS Secrets Manager:',
      error instanceof Error ? error.message : String(error)
    )
    throw error
  }
}

/**
 * Get a specific secret value
 * @param key - The secret key to retrieve
 * @returns {string} - The secret value
 */
export const getSecret = async (key: keyof Secrets): Promise<string> => {
  const secrets = await loadSecrets()
  const value = secrets[key]
  if (!value) {
    throw new Error(`Secret not found: ${key}`)
  }
  return value
}
