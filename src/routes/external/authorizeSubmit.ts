import { Request, Response } from 'express'
import { z } from 'zod'
import { asyncHandler, ApiError } from '../../middleware/errorHandler'
import { getClientIP } from '../../utils/security'
import { checkExternalRateLimit } from '../../utils/rateLimiter'
import { getActiveClient, isRedirectUriRegistered } from '../../utils/externalClients'
import { authenticateUser } from '../../utils/authenticate'
import { createAuthCode } from '../../utils/authCodes'
import { buildRedirectUrl } from '../../utils/externalRedirect'

const submitSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  state: z.string().optional().default(''),
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const LOGIN_IP_RATE_LIMIT_MAX = 20
const LOGIN_EMAIL_RATE_LIMIT_MAX = 5
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

/**
 * POST /auth/external/authorize/submit
 * Called by the hosted login page's own JS (same-origin fetch, JSON body —
 * no new form-urlencoded parser needed). Authenticates via the EXACT same
 * logic /auth/login uses (utils/authenticate.ts) — never reimplemented.
 */
export const authorizeSubmit = asyncHandler(
  async (req: Request, res: Response) => {
    const { client_id, redirect_uri, state, email, password } =
      submitSchema.parse(req.body)

    const ip = getClientIP(undefined, req.headers as Record<string, any>)
    const ipLimit = await checkExternalRateLimit(
      `external-login-ip:${ip}`,
      LOGIN_IP_RATE_LIMIT_MAX,
      LOGIN_RATE_LIMIT_WINDOW_MS,
    )
    if (!ipLimit.allowed) {
      throw new ApiError(429, 'Too many requests', {
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      })
    }

    const emailLimit = await checkExternalRateLimit(
      `external-login-email:${email.toLowerCase()}`,
      LOGIN_EMAIL_RATE_LIMIT_MAX,
      LOGIN_RATE_LIMIT_WINDOW_MS,
    )
    if (!emailLimit.allowed) {
      throw new ApiError(429, 'Too many requests', {
        retryAfterSeconds: emailLimit.retryAfterSeconds,
      })
    }

    // Never trust the hidden client_id/redirect_uri fields blindly —
    // revalidate against the registry exactly as GET /authorize did.
    const client = await getActiveClient(client_id)
    if (!client || !isRedirectUriRegistered(client, redirect_uri)) {
      throw new ApiError(400, 'Invalid client or redirect_uri')
    }

    const user = await authenticateUser(email, password)
    const code = await createAuthCode(client_id, user.id, redirect_uri)

    res.status(200).json({
      redirectUrl: buildRedirectUrl(redirect_uri, code, state),
    })
  },
)
