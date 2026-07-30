import { Request, Response } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { getJWKS } from '../utils/externalAuth'

/**
 * GET /.well-known/jwks.json
 * Public, unauthenticated. Serves the RS256 public key external apps use to
 * verify FLC-issued SSO identity tokens. No DB dependency — this route sits
 * outside the /auth prefix, so the Neo4j init middleware never runs for it.
 */
export const jwks = asyncHandler(async (req: Request, res: Response) => {
  const document = await getJWKS()
  res.set('Cache-Control', 'public, max-age=3600')
  res.status(200).json(document)
})
