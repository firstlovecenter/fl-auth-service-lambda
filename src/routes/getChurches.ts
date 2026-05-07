import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { verifyJWT } from '../utils/auth'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import type { JWTPayload } from '../types'

const getChurchesSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  email: z.string().email('Invalid email address').optional(),
})

interface GraphEntity {
  id: string
  name: string | null
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
 * Fetch churches linked to the authenticated user.
 */
export const getChurches = asyncHandler(async (req: Request, res: Response) => {
  let session

  try {
    const { token, email } = getChurchesSchema.parse(req.body)
    const decoded = (await verifyJWT(token)) as JWTPayload

    if (
      email &&
      decoded.email &&
      email.toLowerCase() !== decoded.email.toLowerCase()
    ) {
      throw new ApiError(
        403,
        'You can only fetch churches for your own account',
      )
    }

    session = getSession()

    const result = await session.run(
      `MATCH (m:User:Member)
       WHERE m.id = $userId OR ($email IS NOT NULL AND m.email = $email)
       WITH m
       LIMIT 1

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[]-(linkedBacenta:Bacenta)
         OPTIONAL MATCH (linkedBacenta)-[]-(linkedGovernorship:Governorship)
         OPTIONAL MATCH (linkedGovernorship)-[]-(linkedCouncil:Council)
         RETURN
           collect(DISTINCT linkedBacenta { .id, name: coalesce(linkedBacenta.name, linkedBacenta.stream_name) }) AS hierarchyBacentas,
           collect(DISTINCT linkedGovernorship { .id, name: linkedGovernorship.name }) AS hierarchyGovernorships,
           collect(DISTINCT linkedCouncil { .id, name: linkedCouncil.name }) AS hierarchyCouncils
       }

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS|IS_ADMIN_FOR|DOES_ARRIVALS_FOR|IS_ARRIVALS_PAYER_FOR]->(roleBacenta:Bacenta)
         RETURN collect(DISTINCT roleBacenta { .id, name: coalesce(roleBacenta.name, roleBacenta.stream_name) }) AS roleBacentas
       }

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS|IS_ADMIN_FOR|DOES_ARRIVALS_FOR]->(roleGovernorship:Governorship)
         RETURN collect(DISTINCT roleGovernorship { .id, name: roleGovernorship.name }) AS roleGovernorships
       }

       CALL {
         WITH m
         OPTIONAL MATCH (m)-[:LEADS|IS_ADMIN_FOR|DOES_ARRIVALS_FOR|IS_ARRIVALS_PAYER_FOR]->(roleCouncil:Council)
         RETURN collect(DISTINCT roleCouncil { .id, name: roleCouncil.name }) AS roleCouncils
       }

       RETURN
         m { .id, .email, .firstName, .lastName } AS user,
         hierarchyBacentas,
         hierarchyGovernorships,
         hierarchyCouncils,
         roleBacentas,
         roleGovernorships,
         roleCouncils`,
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
    const bacentas = dedupeEntities([
      ...(record.get('hierarchyBacentas') ?? []),
      ...(record.get('roleBacentas') ?? []),
    ])
    const governorships = dedupeEntities([
      ...(record.get('hierarchyGovernorships') ?? []),
      ...(record.get('roleGovernorships') ?? []),
    ])
    const councils = dedupeEntities([
      ...(record.get('hierarchyCouncils') ?? []),
      ...(record.get('roleCouncils') ?? []),
    ])

    res.status(200).json({
      message: 'Churches fetched successfully',
      user,
      churches: councils,
      hierarchy: {
        bacentas,
        governorships,
        councils,
      },
      totalChurches: councils.length,
    })
  } finally {
    if (session) {
      await session.close()
    }
  }
})
