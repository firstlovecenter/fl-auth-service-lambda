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

export interface RoleFlags {
  leadsBacenta: boolean
  leadsCampus: boolean
  leadsCouncil: boolean
  leadsStream: boolean
  leadsGovernorship: boolean
  leadsOversight: boolean
  leadsDenomination: boolean
  isAdminForStream: boolean
  isAdminForCampus: boolean
  isAdminForCouncil: boolean
  isAdminForGovernorship: boolean
  isAdminForOversight: boolean
  isAdminForDenomination: boolean
  isArrivalsAdminForStream: boolean
  isArrivalsAdminForCampus: boolean
  isArrivalsAdminForCouncil: boolean
  isArrivalsAdminForGovernorship: boolean
  isArrivalsCounterForStream: boolean
  isArrivalsPayerCouncil: boolean
  isTellerForStream: boolean
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
