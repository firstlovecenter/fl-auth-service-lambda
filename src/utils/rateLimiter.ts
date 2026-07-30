import neo4j from 'neo4j-driver'
import { getSession } from '../db/neo4j'

/**
 * Working, distributed rate limiter for the external-SSO endpoints.
 *
 * utils/security.ts's checkRateLimit is currently hard-disabled AND, even if
 * re-enabled, is an in-memory Map — useless across concurrent/cold-started
 * Lambda instances, which each get their own memory. Neo4j is the one store
 * every Lambda instance already shares, so a fixed-window counter there is
 * the simplest thing that actually works. Scoped to the three new
 * authorize/login/token endpoints only — the existing /auth/login limiter is
 * left untouched (out of scope; SSO_SPEC is purely additive).
 */

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds?: number
}

const toNumber = (value: unknown): number =>
  neo4j.isInt(value) ? value.toNumber() : (value as number)

export const checkExternalRateLimit = async (
  key: string,
  maxAttempts: number,
  windowMs: number,
): Promise<RateLimitResult> => {
  const now = Date.now()
  const windowStart = now - windowMs

  const session = getSession()
  try {
    const result = await session.run(
      `MERGE (b:RateLimitBucket {key: $key})
       ON CREATE SET b.count = 1, b.windowStart = $now
       ON MATCH SET
         b.count = CASE WHEN b.windowStart < $windowStart THEN 1 ELSE b.count + 1 END,
         b.windowStart = CASE WHEN b.windowStart < $windowStart THEN $now ELSE b.windowStart END
       RETURN b.count AS count, b.windowStart AS windowStart`,
      { key, now, windowStart },
    )

    const record = result.records[0]
    const count = toNumber(record.get('count'))
    const bucketStart = toNumber(record.get('windowStart'))

    if (count > maxAttempts) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucketStart + windowMs - now) / 1000),
        ),
      }
    }
    return { allowed: true }
  } finally {
    await session.close()
  }
}
