/**
 * Authoritative role whitelist and permission utilities
 * This is the single source of truth for all supported roles in the system
 */

// Leader Roles
export const ROLE_LEADER_DENOMINATION = 'leaderDenomination'
export const ROLE_LEADER_OVERSIGHT = 'leaderOversight'
export const ROLE_LEADER_CAMPUS = 'leaderCampus'
export const ROLE_LEADER_STREAM = 'leaderStream'
export const ROLE_LEADER_COUNCIL = 'leaderCouncil'
export const ROLE_LEADER_GOVERNORSHIP = 'leaderGovernorship'
export const ROLE_LEADER_BACENTA = 'leaderBacenta'
export const ROLE_LEADER_MINISTRY = 'leaderMinistry'
export const ROLE_LEADER_CREATIVE_ARTS = 'leaderCreativeArts'
export const ROLE_LEADER_HUB_COUNCIL = 'leaderHubCouncil'
export const ROLE_LEADER_HUB = 'leaderHub'

// Admin Roles
export const ROLE_ADMIN_DENOMINATION = 'adminDenomination'
export const ROLE_ADMIN_OVERSIGHT = 'adminOversight'
export const ROLE_ADMIN_CAMPUS = 'adminCampus'
export const ROLE_ADMIN_STREAM = 'adminStream'
export const ROLE_ADMIN_COUNCIL = 'adminCouncil'
export const ROLE_ADMIN_GOVERNORSHIP = 'adminGovernorship'
export const ROLE_ADMIN_MINISTRY = 'adminMinistry'
export const ROLE_ADMIN_CREATIVE_ARTS = 'adminCreativeArts'

// Arrivals Admin Roles
export const ROLE_ARRIVALS_ADMIN_CAMPUS = 'arrivalsAdminCampus'
export const ROLE_ARRIVALS_ADMIN_STREAM = 'arrivalsAdminStream'
export const ROLE_ARRIVALS_ADMIN_COUNCIL = 'arrivalsAdminCouncil'
export const ROLE_ARRIVALS_ADMIN_GOVERNORSHIP = 'arrivalsAdminGovernorship'

// Arrivals Helper Roles
export const ROLE_ARRIVALS_COUNTER_STREAM = 'arrivalsCounterStream'
export const ROLE_ARRIVALS_PAYER_COUNCIL = 'arrivalsPayerCouncil'

// Teller Roles
export const ROLE_TELLER_STREAM = 'tellerStream'

// Fisher Role
export const ROLE_FISHER = 'fisher'

/**
 * Complete list of all supported roles
 * This is the authoritative whitelist - all valid roles must be in this array
 */
export const SUPPORTED_ROLES = [
  // Leader Roles
  ROLE_LEADER_DENOMINATION,
  ROLE_LEADER_OVERSIGHT,
  ROLE_LEADER_CAMPUS,
  ROLE_LEADER_STREAM,
  ROLE_LEADER_COUNCIL,
  ROLE_LEADER_GOVERNORSHIP,
  ROLE_LEADER_BACENTA,
  ROLE_LEADER_MINISTRY,
  ROLE_LEADER_CREATIVE_ARTS,
  ROLE_LEADER_HUB_COUNCIL,
  ROLE_LEADER_HUB,

  // Admin Roles
  ROLE_ADMIN_DENOMINATION,
  ROLE_ADMIN_OVERSIGHT,
  ROLE_ADMIN_CAMPUS,
  ROLE_ADMIN_STREAM,
  ROLE_ADMIN_COUNCIL,
  ROLE_ADMIN_GOVERNORSHIP,
  ROLE_ADMIN_MINISTRY,
  ROLE_ADMIN_CREATIVE_ARTS,

  // Arrivals Admin Roles
  ROLE_ARRIVALS_ADMIN_CAMPUS,
  ROLE_ARRIVALS_ADMIN_STREAM,
  ROLE_ARRIVALS_ADMIN_COUNCIL,
  ROLE_ARRIVALS_ADMIN_GOVERNORSHIP,

  // Arrivals Helper Roles
  ROLE_ARRIVALS_COUNTER_STREAM,
  ROLE_ARRIVALS_PAYER_COUNCIL,

  // Teller Roles
  ROLE_TELLER_STREAM,

  // Fisher Role
  ROLE_FISHER,
] as const

export type SupportedRole = (typeof SUPPORTED_ROLES)[number]

/**
 * Validates if a role is in the supported roles list
 */
export function isSupportedRole(role: string): role is SupportedRole {
  return SUPPORTED_ROLES.includes(role as SupportedRole)
}

/**
 * Filters and validates roles to ensure only supported roles are returned
 */
export function filterValidRoles(roles: string[]): SupportedRole[] {
  return roles.filter(isSupportedRole)
}
