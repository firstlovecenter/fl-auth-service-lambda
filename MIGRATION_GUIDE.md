# Migration Guide: Member to User Labels

This guide explains how to migrate your Neo4j database from using only `Member` labels to adding `User` labels, enabling the refactored auth Lambda to query `User` nodes exclusively (except for signup which still uses `Member`).

## Overview

### Why This Migration?

- **Single ID System**: Eliminates the need for separate `id` and `auth_id` properties
- **Cleaner Queries**: Auth routes query `User` nodes directly
- **Better Semantics**: `User` label represents authenticated users
- **Simplified Error Handling**: Password NULL state detection without token nodes

### What Changes?

1. **New Label**: All `Member` nodes get a `:User` label added (keeps both labels)
2. **New Signup Behavior**: New users are created with both `Member:User` labels
3. **Auth Routes**: Query `User` instead of `Member` (except signup)
4. **Password Setup**: Uses NULL password state instead of SetupToken node
5. **Error Messages**: Login returns "Forgot Password" message for users without passwords

## Prerequisites

- AWS CLI configured with appropriate credentials
- Access to Neo4j database (development for testing first)
- Access to AWS Secrets Manager for credentials
- Node.js 18+ installed locally

## Step 1: Test on Development Database

### 1.1 Run Migration Script (Dry Run)

First, test the migration on your development database without making changes:

```bash
# Dry run on development database
npm run migrate:members-to-users -- --environment development --dry-run
```

**Expected Output:**
```
🔧 Member to User Migration Script
=====================================
Environment: development
Mode: DRY RUN
=====================================

📦 Loading secrets from: dev-fl-auth-service-secrets
✅ Connected to Neo4j database

📊 Initial Statistics:
  Total Members: 150
  Members with User label: 0
  Members without User label: 150

🔍 DRY RUN MODE - No changes will be made

Sample records that would be migrated:
  1. user1@example.com (uuid-1) - Labels: Member
  2. user2@example.com (uuid-2) - Labels: Member
  ...
```

### 1.2 Verify Sample Data

Run this Cypher query to check how many members would be affected:

```bash
# Connect to Neo4j and run:
MATCH (m:Member)
WHERE NOT m:User
RETURN count(m) as unmigratedMembers
```

### 1.3 Run Actual Migration

After confirming the dry run looks correct, execute the migration:

```bash
# Real migration on development database
npm run migrate:members-to-users -- --environment development
```

**Expected Output:**
```
✅ Successfully migrated 150 Member(s) to User

🔍 Verifying migration...

✅ Verification passed: All Members now have :User label

Sample migrated records:
  1. user1@example.com - Labels: Member, User
  2. user2@example.com - Labels: Member, User
  ...

📊 Final Statistics:
  Total Members: 150
  Members with User label: 150
  Members without User label: 0
```

### 1.4 Verify Query Compatibility

Run these verification queries in Neo4j:

```cypher
# Query 1: Verify all Members have User label
MATCH (m:Member)
WHERE NOT m:User
RETURN count(m) as missingUserLabel;
# Expected result: 0

# Query 2: Check User queries work
MATCH (u:User {email: "test@example.com"})
RETURN u.id, u.email;
# Should return user if exists

# Query 3: Verify NULL password detection
MATCH (u:User)
WHERE u.password IS NULL
RETURN count(u) as usersNeedingPasswordSetup;
# Shows users who need password setup
```

## Step 2: Test Auth Lambda on Dev

### 2.1 Deploy Updated Lambda to Development

Push to `dev` branch to trigger automatic deployment:

```bash
git add .
git commit -m "feat: Add User label support and NULL password handling"
git push origin dev
```

Wait for GitHub Actions workflow to complete.

### 2.2 Test Signup Flow

```bash
curl -X POST https://your-dev-api-url/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPassword123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Expected Result:**
- Status: `201 Created`
- User created with both `Member` and `User` labels
- Welcome email sent
- User can login immediately

### 2.3 Test Login Flow - Valid Password

```bash
curl -X POST https://your-dev-api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPassword123!"
  }'
```

**Expected Result:**
- Status: `200 OK`
- Access and refresh tokens returned
- User roles included

### 2.4 Test Login Flow - NULL Password

Create a user with NULL password (migrated user simulation):

```cypher
CREATE (u:Member:User {
  id: randomUUID(),
  email: "migrated-user@example.com",
  password: NULL,
  firstName: "Migrated",
  lastName: "User",
  createdAt: datetime()
})
```

Then try to login:

```bash
curl -X POST https://your-dev-api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "migrated-user@example.com",
    "password": "anything"
  }'
```

**Expected Result:**
- Status: `401 Unauthorized`
- Error message: `"Password not set. Please use 'Forgot Password' to set up your password."`
- Response includes: `"requiresPasswordSetup": true`

### 2.5 Test Verify Token

```bash
curl -X POST https://your-dev-api-url/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "token": "your-access-token"
  }'
```

**Expected Result:**
- Status: `200 OK`
- User data returned

### 2.6 Test Password Setup

```bash
curl -X POST https://your-dev-api-url/auth/setup-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "migrated-user@example.com",
    "token": "valid-setup-token",
    "password": "NewPassword123!"
  }'
```

**Expected Result:**
- Status: `200 OK`
- Password updated
- User can now login with new password

## Step 3: Run Integration Tests

### 3.1 Configure Test Environment

Set Neo4j credentials for tests:

```bash
export NEO4J_URI="neo4j+s://your-dev-instance"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="your-password"
```

### 3.2 Run Tests

```bash
npm test -- src/tests/migration.test.ts src/tests/auth-flows.test.ts
```

**Expected Results:**
- All migration tests pass
- All auth flow tests pass
- NULL password detection works
- User label queries work

## Step 4: Deploy to Production

### 4.1 Run Production Migration

Once satisfied with dev testing:

```bash
# Dry run on production
npm run migrate:members-to-users -- --environment production --dry-run
```

Review the sample records carefully to ensure this is the correct data.

### 4.2 Execute Production Migration

```bash
# Real migration on production
npm run migrate:members-to-users -- --environment production
```

**Important**: This modifies production data. Ensure you have:
- Recent database backup
- Maintenance window scheduled if needed
- Team approval documented

### 4.3 Deploy Production Lambda

```bash
git push origin main
```

Wait for GitHub Actions to deploy to production Lambda.

### 4.4 Monitor Production

Check CloudWatch logs for any errors:

```bash
aws logs tail /aws/lambda/fl-auth-service-lambda --follow
```

Watch for:
- Increased error rates
- Failed password setup attempts
- Database connection issues

## Rollback Procedure

If issues occur, here's how to rollback:

### Database Rollback

Remove User labels (keeps Member label):

```cypher
MATCH (u:User)
REMOVE u:User
```

### Code Rollback

Revert Lambda to previous version:

```bash
# Check previous deployments
aws lambda list-versions-by-function --function-name fl-auth-service-lambda

# Rollback to previous version
aws lambda update-alias \
  --function-name fl-auth-service-lambda \
  --name live \
  --function-version previous-version-number
```

Or push previous code:

```bash
git revert HEAD
git push origin main
```

## Verification Queries

Use these queries to verify migration success:

### Check Overall Status

```cypher
MATCH (m:Member)
WITH 
  count(m) as totalMembers,
  sum(CASE WHEN m:User THEN 1 ELSE 0 END) as withUserLabel,
  sum(CASE WHEN NOT m:User THEN 1 ELSE 0 END) as withoutUserLabel
RETURN totalMembers, withUserLabel, withoutUserLabel
```

### Check Users by Password State

```cypher
MATCH (u:User)
WITH 
  sum(CASE WHEN u.password IS NULL THEN 1 ELSE 0 END) as needsPasswordSetup,
  sum(CASE WHEN u.password IS NOT NULL THEN 1 ELSE 0 END) as hasPassword
RETURN needsPasswordSetup, hasPassword
```

### Find Issues

```cypher
# Members without User label (should be 0)
MATCH (m:Member)
WHERE NOT m:User
RETURN m.email, m.id

# User queries work
MATCH (u:User)
RETURN count(u) as userCount

# Duplicated labels (should be 0)
MATCH (u)
WHERE u:User AND u:User
RETURN u
```

## Common Issues

### Issue: Migration script can't connect to Neo4j

**Causes:**
- Wrong credentials in Secrets Manager
- Network connectivity issue
- Neo4j instance down

**Solution:**
```bash
# Verify credentials
aws secretsmanager get-secret-value \
  --secret-id dev-fl-auth-service-secrets

# Verify Neo4j is accessible
# Check security groups and network configuration
```

### Issue: Login returns "User not found" after migration

**Cause:**
- Queries are looking for User label but some records still only have Member label

**Solution:**
```cypher
# Check which Members are missing User label
MATCH (m:Member)
WHERE NOT m:User
RETURN count(m)

# Manually add label if needed
MATCH (m:Member)
WHERE NOT m:User
SET m:User
```

### Issue: Password setup not working

**Cause:**
- Token validation failing
- User not found when setup attempts

**Solution:**
- Verify token is valid and not expired
- Check user exists with User label: `MATCH (u:User {id: $userId, email: $email})`
- Verify password IS NULL: `WHERE u.password IS NULL`

## Support

For issues during migration:

1. Check CloudWatch logs for error details
2. Verify Neo4j connectivity and data
3. Run verification queries
4. Review test results

If problems persist:
- Refer to [README.md](README.md) for full documentation
- Check [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for endpoint specs
- Review error logs in CloudWatch

## Timeline

Recommended migration timeline:

| Phase | Duration | Action |
|-------|----------|--------|
| **Planning** | 1 day | Review this guide, ensure backup |
| **Dev Test** | 2-4 hours | Dry run, full test, validation |
| **Staging (if available)** | 2-4 hours | Real run, end-to-end testing |
| **Production** | 30 min | Migration + deployment + monitoring |
| **Monitoring** | 24 hours | Watch for issues, verify all flows |

## Success Criteria

Migration is successful when:

- ✅ All Members have User label
- ✅ Signup creates Member:User labels
- ✅ Login queries User label successfully
- ✅ NULL password detection returns correct error
- ✅ Password setup works for migrated users
- ✅ All auth routes work with User label
- ✅ Zero errors in CloudWatch logs
- ✅ 24 hours with no issues reported

---

**Last Updated**: February 2, 2026  
**Version**: 1.0  
**Status**: Ready for deployment
