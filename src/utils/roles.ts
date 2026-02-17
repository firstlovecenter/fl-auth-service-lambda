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
  isSheepSeekerForStream: boolean
}

export function deriveRolesFromFlags(flags: RoleFlags): string[] {
  const roles: string[] = []

  if (flags.leadsBacenta) roles.push('leaderBacenta')
  if (flags.leadsCampus) roles.push('leaderCampus')
  if (flags.leadsCouncil) roles.push('leaderCouncil')
  if (flags.leadsStream) roles.push('leaderStream')
  if (flags.leadsGovernorship) roles.push('leaderGovernorship')
  if (flags.leadsOversight) roles.push('leaderOversight')
  if (flags.leadsDenomination) roles.push('leaderDenomination')

  if (flags.isAdminForStream) roles.push('adminStream')
  if (flags.isAdminForCampus) roles.push('adminCampus')
  if (flags.isAdminForCouncil) roles.push('adminCouncil')
  if (flags.isAdminForGovernorship) roles.push('adminGovernorship')
  if (flags.isAdminForOversight) roles.push('adminOversight')
  if (flags.isAdminForDenomination) roles.push('adminDenomination')

  if (flags.isArrivalsAdminForStream) roles.push('arrivalsAdminStream')
  if (flags.isArrivalsAdminForCampus) roles.push('arrivalsAdminCampus')
  if (flags.isArrivalsAdminForCouncil) roles.push('arrivalsAdminCouncil')
  if (flags.isArrivalsAdminForGovernorship)
    roles.push('arrivalsAdminGovernorship')

  if (flags.isArrivalsCounterForStream) roles.push('arrivalsCounterStream')
  if (flags.isArrivalsPayerCouncil) roles.push('tellerCouncil')
  if (flags.isTellerForStream) roles.push('tellerStream')
  if (flags.isSheepSeekerForStream) roles.push('sheepSeekerStream')

  return [...new Set(roles)]
}
