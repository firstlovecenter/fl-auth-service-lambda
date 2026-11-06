import { Request, Response } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../middleware/errorHandler'
import { getClientIP } from '../../utils/security'
import { checkExternalRateLimit } from '../../utils/rateLimiter'
import { getActiveClient, isRedirectUriRegistered } from '../../utils/externalClients'
import { readRefreshCookie } from '../../utils/cookies'
import { verifyJWT } from '../../utils/auth'
import { createAuthCode } from '../../utils/authCodes'
import { renderLoginPage, renderErrorPage } from '../../views/externalLogin'
import { buildRedirectUrl } from '../../utils/externalRedirect'
import type { JWTPayload } from '../../types'

const authorizeQuerySchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  state: z.string().optional().default(''),
  response_type: z.literal('code'),
  error: z.string().optional(),
})

const AUTHORIZE_RATE_LIMIT_MAX = 60
const AUTHORIZE_RATE_LIMIT_WINDOW_MS = 60 * 1000

/**
 * GET /auth/external/authorize
 * User-facing entry point for external SSO (SSO_SPEC 3.1). Validates
 * client_id + redirect_uri against the registry BEFORE rendering or
 * redirecting anything — an unvalidated redirect_uri is an open-redirect
 * risk, so an invalid request always gets an error PAGE, never a redirect.
 */
export const authorizeGet = asyncHandler(async (req: Request, res: Response) => {
  const ip = getClientIP(undefined, req.headers as Record<string, any>)
  const rateLimit = await checkExternalRateLimit(
    `external-authorize:${ip}`,
    AUTHORIZE_RATE_LIMIT_MAX,
    AUTHORIZE_RATE_LIMIT_WINDOW_MS,
  )
  if (!rateLimit.allowed) {
    res
      .status(429)
      .send(renderErrorPage('Too many requests', 'Please try again shortly.'))
    return
  }

  const parsed = authorizeQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res
      .status(400)
      .send(
        renderErrorPage(
          'Invalid request',
          'Missing or invalid sign-in parameters.',
        ),
      )
    return
  }

  const { client_id, redirect_uri, state, error } = parsed.data

  const client = await getActiveClient(client_id)
  if (!client || !isRedirectUriRegistered(client, redirect_uri)) {
    // Do NOT redirect on failure here — the redirect_uri itself hasn't been
    // validated yet at this point, so redirecting to it would be an
    // open-redirect (SSO_SPEC 3.1 step 1).
    res
      .status(400)
      .send(
        renderErrorPage(
          'Invalid request',
          'This application is not registered, or the redirect address is not recognized.',
        ),
      )
    return
  }

  // Existing FLC session? The refresh cookie's path=/auth means it's already
  // sent on this route — reuse it rather than inventing a second session
  // mechanism.
  const existingRefreshToken = readRefreshCookie(req)
  if (existingRefreshToken) {
    try {
      const decoded = (await verifyJWT(existingRefreshToken)) as JWTPayload
      const code = await createAuthCode(client_id, decoded.userId, redirect_uri)
      res.redirect(buildRedirectUrl(redirect_uri, code, state))
      return
    } catch {
      // Cookie invalid/expired — fall through to the login page.
    }
  }

  res
    .status(200)
    .send(
      renderLoginPage({
        clientName: client.name,
        clientId: client_id,
        redirectUri: redirect_uri,
        state,
        error,
      }),
    )
})
