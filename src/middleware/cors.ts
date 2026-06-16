import { Request, Response, NextFunction } from 'express'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import { getSecret } from '../utils/secrets'

/**
 * CORS middleware for Lambda
 * Allowed origins are loaded from SSM Parameter Store:
 *   /fl-auth/prod/allowed-origins  (JSON array of strings)
 *   /fl-auth/dev/allowed-origins   (JSON array of strings)
 *
 * In addition:
 *  - Any *.firstlovecenter.com / firstlovecenter.com origin is always allowed
 *  - In dev, any localhost origin (any port) is always allowed
 */

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'eu-west-2',
})

let allowedOriginsCache: Set<string> | null = null
let environmentCache: string | null = null

const loadOriginsFromSSM = async (environment: string): Promise<string[]> => {
  const paramPath =
    environment === 'production'
      ? '/fl-auth/prod/allowed-origins'
      : '/fl-auth/dev/allowed-origins'

  try {
    const command = new GetParameterCommand({
      Name: paramPath,
      WithDecryption: false,
    })
    const response = await ssmClient.send(command)
    const value = response.Parameter?.Value
    if (value) {
      return JSON.parse(value) as string[]
    }
  } catch (error) {
    console.warn(
      `Could not load CORS origins from SSM (${paramPath}):`,
      error instanceof Error ? error.message : String(error),
    )
  }
  return []
}

const initializeAllowedOrigins = async (): Promise<{
  origins: Set<string>
  environment: string
}> => {
  if (allowedOriginsCache && environmentCache) {
    return { origins: allowedOriginsCache, environment: environmentCache }
  }

  const environment = await getSecret('ENVIRONMENT')
  environmentCache = environment

  const ssmOrigins = await loadOriginsFromSSM(environment)
  const amplifyUrl = process.env.AMPLIFY_URL

  const allOrigins = [...ssmOrigins, ...(amplifyUrl ? [amplifyUrl] : [])]

  allowedOriginsCache = new Set(allOrigins.filter(Boolean))
  return { origins: allowedOriginsCache, environment }
}

const isAllowedOrigin = (
  requestOrigin: string,
  origins: Set<string>,
  environment: string,
): boolean => {
  // 1. Exact match from SSM list
  if (origins.has(requestOrigin)) {
    return true
  }

  // 2. Wildcard — covers all current and future *.firstlovecenter.com apps
  try {
    const { hostname } = new URL(requestOrigin)
    if (
      hostname === 'firstlovecenter.com' ||
      hostname.endsWith('.firstlovecenter.com')
    ) {
      return true
    }
  } catch {
    // invalid URL — deny
    return false
  }

  // 3. In dev, allow any localhost origin (any port, http or https)
  if (environment !== 'production') {
    try {
      const { hostname } = new URL(requestOrigin)
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return true
      }
    } catch {
      return false
    }
  }

  return false
}

export const corsMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { origins, environment } = await initializeAllowedOrigins()
    const origin = req.headers.origin

    const allowed = !!(origin && isAllowedOrigin(origin, origins, environment))

    // DEV ONLY: some local clients (and certain browser extensions / proxies)
    // send a cross-origin request WITHOUT an Origin header. Then `allowed` is
    // false and we'd omit Access-Control-Allow-Origin entirely — which the
    // browser reports as a CORS failure even though the request succeeded.
    // In production this stays false, so such requests are denied.
    const devNoOriginFallback = !origin && environment !== 'production'

    console.log('[CORS DEBUG]', {
      method: req.method,
      path: req.path,
      origin: origin ?? '(none)',
      environment,
      allowed,
      devNoOriginFallback,
      cachedOrigins: [...origins],
    })

    if (allowed && origin) {
      // Specific allowed origin — safe to advertise credentials support.
      res.header('Access-Control-Allow-Origin', origin)
      res.header('Access-Control-Allow-Credentials', 'true')
    } else if (devNoOriginFallback) {
      // NOTE: '*' MUST NOT be combined with Allow-Credentials per the CORS spec.
      res.header('Access-Control-Allow-Origin', '*')
    }
    res.header('Vary', 'Origin')
    res.header(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    )
    res.header(
      'Access-Control-Allow-Headers',
      'Origin,X-Requested-With,Content-Type,Accept,Authorization',
    )

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }

    next()
  } catch (error) {
    next(error)
  }
}
