import {
  ROLE_LEADER_DENOMINATION,
  ROLE_LEADER_OVERSIGHT,
  ROLE_LEADER_CAMPUS,
  ROLE_LEADER_STREAM,
  ROLE_LEADER_COUNCIL,
  ROLE_LEADER_GOVERNORSHIP,
  ROLE_LEADER_BACENTA,
  ROLE_ADMIN_DENOMINATION,
  ROLE_ADMIN_OVERSIGHT,
  ROLE_ADMIN_CAMPUS,
  ROLE_ADMIN_STREAM,
  ROLE_ADMIN_COUNCIL,
  ROLE_ADMIN_GOVERNORSHIP,
  ROLE_ARRIVALS_ADMIN_STREAM,
  ROLE_ARRIVALS_ADMIN_CAMPUS,
  ROLE_ARRIVALS_ADMIN_COUNCIL,
  ROLE_ARRIVALS_ADMIN_GOVERNORSHIP,
  ROLE_ARRIVALS_COUNTER_STREAM,
  ROLE_ARRIVALS_PAYER_COUNCIL,
  ROLE_TELLER_STREAM,
  ROLE_FISHER,
  filterValidRoles,
} from './permission-utils'

export const ROLES_CLAIM = 'roles'

export interface ChurchNode {
  id: string
  name: string
}

export interface RoleFlags {
  leadsBacenta: boolean
  leadsBacentaOf?: ChurchNode | null
  leadsCampus: boolean
  leadsCampusOf?: ChurchNode | null
  leadsCouncil: boolean
  leadsCouncilOf?: ChurchNode | null
  leadsStream: boolean
  leadsStreamOf?: ChurchNode | null
  leadsGovernorship: boolean
  leadsGovernorshipOf?: ChurchNode | null
  leadsOversight: boolean
  leadsOversightOf?: ChurchNode | null
  leadsDenomination: boolean
  leadsDenominationOf?: ChurchNode | null
  isAdminForStream: boolean
  isAdminForStreamOf?: ChurchNode | null
  isAdminForCampus: boolean
  isAdminForCampusOf?: ChurchNode | null
  isAdminForCouncil: boolean
  isAdminForCouncilOf?: ChurchNode | null
  isAdminForGovernorship: boolean
  isAdminForGovernorshipOf?: ChurchNode | null
  isAdminForOversight: boolean
  isAdminForOversightOf?: ChurchNode | null
  isAdminForDenomination: boolean
  isAdminForDenominationOf?: ChurchNode | null
  isArrivalsAdminForStream: boolean
  isArrivalsAdminForStreamOf?: ChurchNode | null
  isArrivalsAdminForCampus: boolean
  isArrivalsAdminForCampusOf?: ChurchNode | null
  isArrivalsAdminForCouncil: boolean
  isArrivalsAdminForCouncilOf?: ChurchNode | null
  isArrivalsAdminForGovernorship: boolean
  isArrivalsCounterForStream: boolean
  isArrivalsCounterForStreamOf?: ChurchNode | null
  isArrivalsPayerCouncil: boolean
  isArrivalsPayerCouncilOf?: ChurchNode | null
  isTellerForStream: boolean
  isTellerForStreamOf?: ChurchNode | null
  isSheepSeekerForStream?: boolean
  isSheepSeekerForStreamOf?: ChurchNode | null
  isFisher: boolean
}

export function deriveRolesFromFlags(flags: RoleFlags): string[] {
  const roles: string[] = []

  // Leader Roles
  if (flags.leadsBacenta) roles.push(ROLE_LEADER_BACENTA)
  if (flags.leadsCampus) roles.push(ROLE_LEADER_CAMPUS)
  if (flags.leadsCouncil) roles.push(ROLE_LEADER_COUNCIL)
  if (flags.leadsStream) roles.push(ROLE_LEADER_STREAM)
  if (flags.leadsGovernorship) roles.push(ROLE_LEADER_GOVERNORSHIP)
  if (flags.leadsOversight) roles.push(ROLE_LEADER_OVERSIGHT)
  if (flags.leadsDenomination) roles.push(ROLE_LEADER_DENOMINATION)

  // Admin Roles
  if (flags.isAdminForStream) roles.push(ROLE_ADMIN_STREAM)
  if (flags.isAdminForCampus) roles.push(ROLE_ADMIN_CAMPUS)
  if (flags.isAdminForCouncil) roles.push(ROLE_ADMIN_COUNCIL)
  if (flags.isAdminForGovernorship) roles.push(ROLE_ADMIN_GOVERNORSHIP)
  if (flags.isAdminForOversight) roles.push(ROLE_ADMIN_OVERSIGHT)
  if (flags.isAdminForDenomination) roles.push(ROLE_ADMIN_DENOMINATION)

  // Arrivals Admin Roles
  if (flags.isArrivalsAdminForStream) roles.push(ROLE_ARRIVALS_ADMIN_STREAM)
  if (flags.isArrivalsAdminForCampus) roles.push(ROLE_ARRIVALS_ADMIN_CAMPUS)
  if (flags.isArrivalsAdminForCouncil) roles.push(ROLE_ARRIVALS_ADMIN_COUNCIL)
  if (flags.isArrivalsAdminForGovernorship)
    roles.push(ROLE_ARRIVALS_ADMIN_GOVERNORSHIP)

  // Arrivals Helper Roles
  if (flags.isArrivalsCounterForStream) roles.push(ROLE_ARRIVALS_COUNTER_STREAM)
  if (flags.isArrivalsPayerCouncil) roles.push(ROLE_ARRIVALS_PAYER_COUNCIL)

  // Teller Roles
  if (flags.isTellerForStream) roles.push(ROLE_TELLER_STREAM)

  // Fisher Role
  if (flags.isFisher) roles.push(ROLE_FISHER)

  // Ensure only valid roles are returned and remove duplicates
  return [...new Set(filterValidRoles(roles))]
}

const CHURCH_SCOPE_KEYS: ReadonlyArray<keyof RoleFlags> = [
  'leadsBacentaOf',
  'leadsGovernorshipOf',
  'leadsCouncilOf',
  'leadsStreamOf',
  'leadsCampusOf',
  'leadsOversightOf',
  'leadsDenominationOf',
  'isAdminForCampusOf',
  'isAdminForGovernorshipOf',
  'isAdminForCouncilOf',
  'isAdminForStreamOf',
  'isAdminForOversightOf',
  'isAdminForDenominationOf',
  'isArrivalsAdminForStreamOf',
  'isArrivalsAdminForCampusOf',
  'isArrivalsAdminForCouncilOf',
  'isArrivalsCounterForStreamOf',
  'isArrivalsPayerCouncilOf',
  'isTellerForStreamOf',
  'isSheepSeekerForStreamOf',
]

export function extractChurchScopes(
  flags: Record<string, unknown>,
): Record<string, ChurchNode> {
  const scopes: Record<string, ChurchNode> = {}
  for (const key of CHURCH_SCOPE_KEYS) {
    const value = flags[key as string]
    if (value != null) {
      scopes[key as string] = value as ChurchNode
    }
  }
  return scopes
}
