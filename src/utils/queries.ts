/**
 * Reusable Cypher query fragments for member authentication and role resolution
 */

export const MEMBER_FLAGS_QUERY = `{
  leadsBacenta:        exists((m)-[:LEADS]->(:Bacenta)),
  leadsGovernorship:   exists((m)-[:LEADS]->(:Governorship)),
  leadsCouncil:        exists((m)-[:LEADS]->(:Council)),
  leadsStream:         exists((m)-[:LEADS]->(:Stream)),
  leadsCampus:         exists((m)-[:LEADS]->(:Campus)),
  leadsOversight:      exists((m)-[:LEADS]->(:Oversight)),
  leadsDenomination:   exists((m)-[:LEADS]->(:Denomination)),
  isAdminForCampus:        exists((m)-[:IS_ADMIN_FOR]->(:Campus)),
  isAdminForGovernorship:  exists((m)-[:IS_ADMIN_FOR]->(:Governorship)),
  isAdminForCouncil:       exists((m)-[:IS_ADMIN_FOR]->(:Council)),
  isAdminForStream:        exists((m)-[:IS_ADMIN_FOR]->(:Stream)),
  isAdminForOversight:     exists((m)-[:IS_ADMIN_FOR]->(:Oversight)),
  isAdminForDenomination:  exists((m)-[:IS_ADMIN_FOR]->(:Denomination)),
  isArrivalsAdminForStream:        exists((m)-[:DOES_ARRIVALS_FOR]->(:Stream)),
  isArrivalsAdminForCampus:       exists((m)-[:DOES_ARRIVALS_FOR]->(:Campus)),
  isArrivalsAdminForCouncil:      exists((m)-[:DOES_ARRIVALS_FOR]->(:Council)),
  isArrivalsCounterForStream:     exists((m)-[:COUNTS_ARRIVALS_FOR]->(:Stream)),
  isArrivalsPayerCouncil:         exists((m)-[:IS_ARRIVALS_PAYER_FOR]->(:Council)),
  isTellerForStream:              exists((m)-[:IS_TELLER_FOR]->(:Stream)),
  isSheepSeekerForStream:         exists((m)-[:IS_SHEEP_SEEKER_FOR]->(:Stream)),
  isFisher:                       m.isFisher
} AS flags`
