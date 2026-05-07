import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { AuthenticatedRequest } from '../middleware/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'

const getChurchesSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
})

interface GraphEntity {
  id: string
  name: string | null
  __typename?: string
}

const dedupeEntities = (entities: GraphEntity[]): GraphEntity[] => {
  const unique = new Map<string, GraphEntity>()

  for (const entity of entities) {
    if (!entity?.id) {
      continue
    }

    if (!unique.has(entity.id)) {
      unique.set(entity.id, {
        id: entity.id,
        name: entity.name ?? 'Unknown',
      })
    }
  }

  return Array.from(unique.values())
}

/**
 * POST /auth/churches
 * Fetch churches the authenticated user leads, grouped by church level.
 */
export const getChurches = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { email } = getChurchesSchema.parse(req.body)
    const decoded = (req as AuthenticatedRequest).auth

    if (email && decoded.email && email.toLowerCase() !== decoded.email.toLowerCase()) {
      throw new ApiError(403, 'You can only fetch churches for your own account')
    }

    session = getSession()

    const result = await session.run(
      `MATCH (m:User:Member)
       WHERE m.id = $userId OR ($email IS NOT NULL AND m.email = $email)
       WITH m
       LIMIT 1

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS]->(n:Bacenta)
         RETURN collect(DISTINCT n { .id, name: coalesce(n.name, n.stream_name), __typename: 'Bacenta' }) AS leadsBacenta
       }

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS]->(n:Governorship)
         RETURN collect(DISTINCT n { .id, name: n.name, __typename: 'Governorship' }) AS leadsGovernorship
       }

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS]->(n:Council)
         RETURN collect(DISTINCT n { .id, name: n.name, __typename: 'Council' }) AS leadsCouncil
       }

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS]->(n:Stream)
         RETURN collect(DISTINCT n { .id, name: n.name, __typename: 'Stream' }) AS leadsStream
       }

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS]->(n:Campus)
         RETURN collect(DISTINCT n { .id, name: n.name, __typename: 'Campus' }) AS leadsCampus
       }

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS]->(n:Oversight)
         RETURN collect(DISTINCT n { .id, name: n.name, __typename: 'Oversight' }) AS leadsOversight
       }

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS]->(n:Denomination)
         RETURN collect(DISTINCT n { .id, name: n.name, __typename: 'Denomination' }) AS leadsDenomination
       }

       RETURN
         m { .id, .email, .firstName, .lastName } AS user,
         leadsBacenta,
         leadsGovernorship,
         leadsCouncil,
         leadsStream,
         leadsCampus,
         leadsOversight,
         leadsDenomination`,
      {
        userId: decoded.userId,
        email: email ?? null,
      },
    )

    if (result.records.length === 0) {
      throw new ApiError(404, 'User not found')
    }

    const record = result.records[0]
    const user = record.get('user')
    const leadsBacenta = dedupeEntities(record.get('leadsBacenta') ?? [])
    const leadsGovernorship = dedupeEntities(record.get('leadsGovernorship') ?? [])
    const leadsCouncil = dedupeEntities(record.get('leadsCouncil') ?? [])
    const leadsStream = dedupeEntities(record.get('leadsStream') ?? [])
    const leadsCampus = dedupeEntities(record.get('leadsCampus') ?? [])
    const leadsOversight = dedupeEntities(record.get('leadsOversight') ?? [])
    const leadsDenomination = dedupeEntities(record.get('leadsDenomination') ?? [])

    const totalLeads =
      leadsBacenta.length +
      leadsGovernorship.length +
      leadsCouncil.length +
      leadsStream.length +
      leadsCampus.length +
      leadsOversight.length +
      leadsDenomination.length

    res.status(200).json({
      message: 'Lead churches fetched successfully',
      user,
      leadsBacenta,
      leadsGovernorship,
      leadsCouncil,
      leadsStream,
      leadsCampus,
      leadsOversight,
      leadsDenomination,
      totalLeads,
    })
  } finally {
    if (session) {
      await session.close()
    }
  }
})