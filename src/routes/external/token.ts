import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../../db/neo4j'
import { asyncHandler, ApiError } from '../../middleware/errorHandler'
import { getClientIP } from '../../utils/security'
import { checkExternalRateLimit } from '../../utils/rateLimiter'
import {
  getActiveClient,
  verifyClientSecret,
  isRedirectUriRegistered,
} from '../../utils/externalClients'
import { peekAuthCode, consumeAuthCode } from '../../utils/authCodes'
import { signExternalJWT } from '../../utils/externalAuth'

const tokenSchema = z.object({
  code: z.string().min(1, 'code is required'),
  client_id: z.string().min(1, 'client_id is required'),
  client_secret: z.string().min(1, 'client_secret is required'),
  redirect_uri: z.string().min(1, 'redirect_uri is required'),
})

const TOKEN_RATE_LIMIT_MAX = 30
const TOKEN_RATE_LIMIT_WINDOW_MS = 60 * 1000

/**
 * POST /auth/external/token
 * Server-to-server exchange of a single-use authorization code for an
 * RS256-signed identity token (SSO_SPEC 2.3). Exposes id/email/name only.
 */
export const externalToken = asyncHandler(
  async (req: Request, res: Response) => {
    const ip = getClientIP(undefined, req.headers as Record<string, any>)
    const rateLimit = await checkExternalRateLimit(
      `external-token:${ip}`,
      TOKEN_RATE_LIMIT_MAX,
      TOKEN_RATE_LIMIT_WINDOW_MS,
    )
    if (!rateLimit.allowed) {
      throw new ApiError(429, 'Too many requests', {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      })
    }

    const { code, client_id, client_secret, redirect_uri } =
      tokenSchema.parse(req.body)

    // 1. client_id exists and is active.
    const client = await getActiveClient(client_id)
    if (!client) {
      throw new ApiError(401, 'Invalid client')
    }

    // 2. client_secret matches the stored hash.
    const secretValid = await verifyClientSecret(client, client_secret)
    if (!secretValid) {
      throw new ApiError(401, 'Invalid client')
    }

    // 3. code exists, not expired, not already used (read-only check —
    //    NOT consumed yet, so a request that fails steps 4/5 below doesn't
    //    burn a code that belongs to someone else).
    const authCode = await peekAuthCode(code)
    if (!authCode) {
      throw new ApiError(400, 'Invalid or expired code')
    }

    // 4. the code's client_id matches the requesting client.
    if (authCode.clientId !== client_id) {
      throw new ApiError(400, 'Invalid or expired code')
    }

    // 5. redirect_uri matches the one stored with the code (and is still a
    //    registered redirect for this client).
    if (
      authCode.redirectUri !== redirect_uri ||
      !isRedirectUriRegistered(client, redirect_uri)
    ) {
      throw new ApiError(400, 'redirect_uri mismatch')
    }

    // All checks passed — now, and only now, burn the code.
    const consumed = await consumeAuthCode(code)
    if (!consumed) {
      // Lost a race to a concurrent request replaying the same code.
      throw new ApiError(400, 'Invalid or expired code')
    }

    // Look up the user. Expose NOTHING but id/email/name.
    const session = getSession()
    let user
    try {
      const result = await session.run(
        `MATCH (u:User:Member {id: $userId})
         RETURN u.id AS id, u.email AS email, u.firstName AS firstName, u.lastName AS lastName
         LIMIT 1`,
        { userId: authCode.userId },
      )
      if (result.records.length === 0) {
        throw new ApiError(404, 'User not found')
      }
      const record = result.records[0]
      user = {
        id: record.get('id') as string,
        email: record.get('email') as string,
        name: [record.get('firstName'), record.get('lastName')]
          .filter(Boolean)
          .join(' '),
      }
    } finally {
      await session.close()
    }

    const token = await signExternalJWT(
      {
        aud: client_id,
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      '5m',
    )

    res.status(200).json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 300,
    })
  },
)
