# Database Migrations: Member to User Labels

Run the migration to add User labels to your Neo4j database.

## What This Does

Adds the `:User` label to all existing `Member` nodes, creating a dual-label structure:

```cypher
Before:  (:Member { ... })
After:   (:Member:User { ... })
```

This enables the refactored auth system that queries `:User` nodes instead of `:Member`.

## Quick Start

### Dry Run (Recommended First)

```bash
npm run migrate:members-to-users -- --environment development --dry-run
```

This shows what would happen without making changes:

```
✅ Connected to Neo4j
📊 Pre-migration statistics:
   Members without User label: 150
   Members with User label: 0

🔄 DRY RUN MODE - No changes made
   Would add User label to 150 nodes

✅ Migration complete (dry run)
```

### Run Actual Migration

```bash
npm run migrate:members-to-users -- --environment development
```

Output:

```
✅ Connected to Neo4j
📊 Pre-migration statistics:
   Members without User label: 150

🔄 Migrating...

✅ Successfully added User label to 150 nodes
📊 Post-migration statistics:
   Members without User label: 0
   Members with User label: 150

📋 Sample migrated node:
   ID: 550e8400-e29b-41d4-a716-446655440000
   Email: john@example.com
   Has password: true

✅ Migration complete
```

## Prerequisites

- Node.js 18+ installed
- npm dependencies installed: `npm install`
- AWS credentials configured: `aws configure`
- Access to target Neo4j database
- Database credentials in AWS Secrets Manager

## Step-by-Step

### 1. Verify Current State

Check how many nodes need migration:

```bash
# List databases
npm run migrate:members-to-users -- --environment development --dry-run

# Look at "Pre-migration statistics"
```

### 2. Test on Development First

**Always test on dev before production**:

```bash
npm run migrate:members-to-users -- --environment development --dry-run
npm run migrate:members-to-users -- --environment development
```

Verify migration succeeded by checking logs.

### 3. Verify Migration

Query the database to confirm:

```bash
# Using cypher-shell
cypher-shell -u neo4j -p PASSWORD "MATCH (m:Member) WHERE NOT m:User RETURN count(m)"

# Should return: 0 (all migrated)
```

Or query via Lambda:

```bash
node -e "
const neo4j = require('neo4j-driver');
const driver = neo4j.driver('bolt://your-db:7687', neo4j.auth.basic('neo4j', 'password'));
const session = driver.session();
session.run('MATCH (m:Member) WHERE NOT m:User RETURN count(m)').then(result => {
  console.log('Unmigrated members:', result.records[0].get(0).toNumber());
  process.exit(0);
});
"
```

### 4. Run Tests

Verify auth flows still work:

```bash
npm test
```

All tests should pass.

### 5. Deploy Updated Lambda

```bash
# Push code to deploy
git push origin main  # Production
git push origin dev   # Development
```

## Migration Script Details

Located in `src/scripts/migrate-members-to-users.ts`

### Features

✅ **Dry Run Mode**: Preview changes without modifying database  
✅ **Statistics**: Shows before/after node counts  
✅ **Sample Display**: Shows example of migrated node  
✅ **AWS Secrets Manager**: Loads credentials securely  
✅ **Error Handling**: Clear error messages if something fails  
✅ **Progress Reporting**: Real-time migration status  

### Command Options

```bash
# Development with dry run (safest)
npm run migrate:members-to-users -- --environment development --dry-run

# Development actual migration
npm run migrate:members-to-users -- --environment development

# Production with dry run (test first!)
npm run migrate:members-to-users -- --environment production --dry-run

# Production actual migration (use with caution)
npm run migrate:members-to-users -- --environment production
```

### How It Works

```typescript
// 1. Load secrets from AWS
const secrets = await getSecret('dev-fl-auth-service-secrets')

// 2. Connect to Neo4j
const driver = neo4j.driver(secrets.NEO4J_URI, ...)

// 3. Count unmigrated members
MATCH (m:Member) WHERE NOT m:User RETURN count(m)

// 4. Add User label
MATCH (m:Member) WHERE NOT m:User SET m:User

// 5. Verify migration
MATCH (m:Member) WHERE NOT m:User RETURN count(m)
```

## Rollback (If Needed)

If migration fails or causes issues:

### Remove User Labels

```bash
# Using cypher-shell
cypher-shell -u neo4j -p PASSWORD "MATCH (u:User) REMOVE u:User"
```

Or create a rollback script:

```typescript
// scripts/rollback-user-label.ts
const session = driver.session()
await session.run('MATCH (u:User) REMOVE u:User')
console.log('✅ Removed User labels')
```

### Verify Rollback

```bash
# Check that all User labels are gone
cypher-shell "MATCH (u:User) RETURN count(u)"
# Should return: 0
```

## Troubleshooting

### "Failed to load secrets"

**Problem:** Can't connect to AWS Secrets Manager  
**Solution:**
```bash
# Verify AWS credentials
aws sts get-caller-identity

# Verify secret exists
aws secretsmanager describe-secret --secret-id dev-fl-auth-service-secrets
```

### "Failed to connect to Neo4j"

**Problem:** Can't reach database  
**Solution:**
```bash
# Test database connectivity
nc -zv your-db-host 7687

# Verify credentials in secret
aws secretsmanager get-secret-value --secret-id dev-fl-auth-service-secrets
```

### "Migration failed halfway"

**Problem:** Database operation failed mid-migration  
**Solution:**
```bash
# Check how many nodes were migrated
cypher-shell "MATCH (m:Member) WHERE NOT m:User RETURN count(m)"

# If partially done, run migration again (it's idempotent)
npm run migrate:members-to-users -- --environment development
```

## Safety Measures

✅ **Always Dry Run First**
```bash
npm run migrate:members-to-users -- --environment development --dry-run
```

✅ **Test on Dev Before Prod**
```bash
# Dev environment
npm run migrate:members-to-users -- --environment development

# Only if dev succeeds
npm run migrate:members-to-users -- --environment production
```

✅ **Backup Database** (if available)
```bash
# Contact DBA or backup Neo4j instance
```

✅ **Have Rollback Plan**
- Know how to remove User labels if needed
- Keep this guide handy
- Have communication ready

## After Migration

### Update Lambda

Deploy the new Lambda code that uses `:User` labels:

```bash
git push origin main
# Or manually deploy via AWS console
```

### Verify Auth Routes Work

```bash
# Test login
curl -X POST https://your-api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "existing-user@example.com",
    "password": "their-password"
  }'

# Should return 200 with tokens
```

### Monitor Logs

```bash
aws logs tail /aws/lambda/fl-auth-service-lambda --follow
```

Watch for:
- ✅ Successful User label queries
- ❌ Any "not found" errors
- ❌ Database connection issues

## Database Schema After Migration

```cypher
(:Member:User {
  id: "uuid-string",
  email: "user@example.com",
  password: "bcrypt-hash",
  firstName: "John",
  lastName: "Doe",
  createdAt: datetime,
  updatedAt: datetime,
  lastLoginAt: datetime
})
```

**Constraints:**
```cypher
CREATE CONSTRAINT user_email_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.email IS UNIQUE
```

**Indexes:**
```cypher
CREATE INDEX user_id IF NOT EXISTS FOR (u:User) ON (u.id)
CREATE INDEX user_email IF NOT EXISTS FOR (u:User) ON (u.email)
```

## Next Steps

1. [Deployment Guide](../setup/DEPLOYMENT.md) - Deploy updated Lambda
2. [Architecture Overview](../architecture/OVERVIEW.md) - Understand dual labels
3. [Testing](../setup/GETTING_STARTED.md#running-tests) - Verify auth flows

---

**See Also:**
- [Neo4j Documentation](https://neo4j.com/docs/)
- [Cypher Query Language](https://neo4j.com/docs/cypher-manual/)
