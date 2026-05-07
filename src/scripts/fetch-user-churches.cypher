// Fetch church hierarchy for a user by email (optimized single-pass retrieval)
// Params:
//   :param email => "user@example.com"

MATCH (m:User:Member {email: $email})
WITH m
LIMIT 1

CALL {
  WITH m
  OPTIONAL MATCH (m)-[]-(linkedBacenta:Bacenta)
  OPTIONAL MATCH (linkedBacenta)-[]-(linkedGovernorship:Governorship)
  OPTIONAL MATCH (linkedGovernorship)-[]-(linkedCouncil:Council)
  RETURN
    collect(DISTINCT linkedBacenta { .id, name: coalesce(linkedBacenta.name, linkedBacenta.stream_name) }) AS hierarchyBacentas,
    collect(DISTINCT linkedGovernorship { .id, .name }) AS hierarchyGovernorships,
    collect(DISTINCT linkedCouncil { .id, .name }) AS hierarchyCouncils
}

CALL {
  WITH m
  OPTIONAL MATCH (m)-[:LEADS|IS_ADMIN_FOR|DOES_ARRIVALS_FOR|IS_ARRIVALS_PAYER_FOR]->(roleBacenta:Bacenta)
  RETURN collect(DISTINCT roleBacenta { .id, name: coalesce(roleBacenta.name, roleBacenta.stream_name) }) AS roleBacentas
}

CALL {
  WITH m
  OPTIONAL MATCH (m)-[:LEADS|IS_ADMIN_FOR|DOES_ARRIVALS_FOR]->(roleGovernorship:Governorship)
  RETURN collect(DISTINCT roleGovernorship { .id, .name }) AS roleGovernorships
}

CALL {
  WITH m
  OPTIONAL MATCH (m)-[:LEADS|IS_ADMIN_FOR|DOES_ARRIVALS_FOR|IS_ARRIVALS_PAYER_FOR]->(roleCouncil:Council)
  RETURN collect(DISTINCT roleCouncil { .id, .name }) AS roleCouncils
}

RETURN
  m { .id, .email, .firstName, .lastName } AS user,
  hierarchyBacentas,
  hierarchyGovernorships,
  hierarchyCouncils,
  roleBacentas,
  roleGovernorships,
  roleCouncils;
