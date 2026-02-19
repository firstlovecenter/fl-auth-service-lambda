/**
 * Cypher Migration Script: Add isFisher property to all User nodes
 * 
 * Run this directly in Neo4j Browser or use it in your migration tool.
 * This script adds the isFisher boolean property to all User nodes that don't have it yet.
 * 
 * The isFisher property:
 * - Type: Boolean
 * - Default value: false
 * - Purpose: When set to true, users automatically receive the "fisher" role
 * 
 * Script Execution:
 * 1. Sets isFisher = false for all users that don't have this property
 * 2. Verifies the update by counting users with the property
 * 3. Can be safely run multiple times (idempotent)
 */

// Step 1: Count users without isFisher property
MATCH (u:User|Member) 
WHERE u.isFisher IS NULL 
RETURN count(u) as usersToUpdate;

// Step 2: Add isFisher property with default value of false
MATCH (u:User|Member) 
WHERE u.isFisher IS NULL 
SET u.isFisher = false
RETURN count(u) as updated, "isFisher property added" as status;

// Step 3: Verify - Count users with isFisher = false
MATCH (u:User|Member) 
WHERE u.isFisher = false 
RETURN count(u) as usersWithIsFisherFalse;

// Step 4: Verify - Count users with isFisher = true
MATCH (u:User|Member) 
WHERE u.isFisher = true 
RETURN count(u) as usersWithIsFisherTrue;

// Step 5: Final verification - Count all users with isFisher property
MATCH (u:User|Member) 
WHERE u.isFisher IS NOT NULL 
RETURN count(u) as totalUsersWithProperty, 
       "All users now have isFisher property" as status;
