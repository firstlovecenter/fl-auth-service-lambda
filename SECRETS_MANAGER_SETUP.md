# AWS Secrets Manager Integration & Dual-Branch Deployment

## Overview

Your Auth Lambda now uses **AWS Secrets Manager** instead of environment variables, and supports **dual-branch deployment** (main → production, dev → development).

---

## 🔐 AWS Secrets Manager Setup

### 1. Create Secrets in AWS

You need to create **two secrets** in AWS Secrets Manager:

#### Production Secret: `fl-auth-service-secrets`
```json
{
  "JWT_SECRET": "your-production-jwt-secret-here",
  "PEPPER": "your-production-pepper-here",
  "NEO4J_URI": "bolt://production-neo4j-instance:7687",
  "NEO4J_USER": "neo4j-user",
  "NEO4J_PASSWORD": "neo4j-password"
}
```

#### Development Secret: `dev-fl-auth-service-secrets`
```json
{
  "JWT_SECRET": "your-dev-jwt-secret-here",
  "PEPPER": "your-dev-pepper-here",
  "NEO4J_URI": "bolt://dev-neo4j-instance:7687",
  "NEO4J_USER": "neo4j-user-dev",
  "NEO4J_PASSWORD": "neo4j-password-dev"
}
```

### 2. Create in AWS Console

1. Go to **AWS Secrets Manager**
2. Click **"Store a new secret"**
3. Choose **"Other type of secret"**
4. Paste the JSON above
5. Set name: `fl-auth-service-secrets` (production) or `dev-fl-auth-service-secrets` (dev)

### 3. Update Lambda IAM Role

Your Lambda's IAM role needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:eu-west-2:YOUR-ACCOUNT-ID:secret:fl-auth-service-secrets-*",
        "arn:aws:secretsmanager:eu-west-2:YOUR-ACCOUNT-ID:secret:dev-fl-auth-service-secrets-*"
      ]
    }
  ]
}
```

---

## 🌳 Dual-Branch Deployment

### Branch Structure

| Branch | Lambda Function | Secret Name | IAM Environment |
|--------|-----------------|-------------|-----------------|
| `main` | `fl-auth-service-lambda` | `fl-auth-service-secrets` | Production |
| `dev` | `dev-fl-auth-service-lambda` | `dev-fl-auth-service-secrets` | Development |

### How It Works

1. **Push to main** → Deploys to production Lambda
   - Uses `fl-auth-service-lambda` function
   - Loads `fl-auth-service-secrets` from Secrets Manager
   - Slack notification includes: Environment: production

2. **Push to dev** → Deploys to dev Lambda
   - Uses `dev-fl-auth-service-lambda` function
   - Loads `dev-fl-auth-service-secrets` from Secrets Manager
   - Slack notification includes: Environment: development

### Deployment Workflow

```yaml
Trigger: Push to main or dev branch
  ↓
Checkout code
  ↓
Determine target (main → prod, dev → dev)
  ↓
Build TypeScript
  ↓
Package Lambda (zip with node_modules)
  ↓
Deploy to appropriate function
  ↓
Verify function updated
  ↓
Slack notification with environment details
```

---

## 📝 Code Changes

### New File: `src/utils/secrets.ts`

Handles loading secrets from AWS Secrets Manager with caching:

```typescript
const secrets = await loadSecrets()
// First call: Fetches from AWS Secrets Manager
// Subsequent calls: Returns cached secrets (faster)

const jwtSecret = await getSecret('JWT_SECRET')
```

**Benefits:**
- ✅ Caches secrets in Lambda container (reused on warm starts)
- ✅ Type-safe (TypeScript interfaces for secrets)
- ✅ Error handling with validation
- ✅ Minimal latency after first call

### Updated File: `src/utils/auth.ts`

All JWT functions are now **async**:

```typescript
// Before
const token = signJWT(payload)

// After
const token = await signJWT(payload)
```

Functions that changed:
- `hashPassword()` - async (loads pepper)
- `comparePassword()` - async (loads pepper)
- `signJWT()` - async (loads JWT secret)
- `signRefreshToken()` - async (loads JWT secret)
- `verifyJWT()` - async (loads JWT secret)

### Updated File: `src/db/neo4j.ts`

Loads database credentials from Secrets Manager:

```typescript
const uri = await getSecret('NEO4J_URI')
const user = await getSecret('NEO4J_USER')
const password = await getSecret('NEO4J_PASSWORD')
```

---

## 📊 GitHub Actions Workflow

### Automatic Deployment

```bash
# Push to main
git push origin main
→ Deploy to fl-auth-service-lambda (production)

# Push to dev
git push origin dev
→ Deploy to dev-fl-auth-service-lambda (development)

# Manual trigger
→ Can choose environment in GitHub UI
```

### Slack Notifications

Each deployment sends a Slack message:

```
🔐 FL Auth Service Lambda Deployment

Environment: production
Function: fl-auth-service-lambda
Commit: Fix: Update password validation
Status: success ✅
```

### No Environment Variables Needed

The workflow **no longer sets Lambda environment variables**. Secrets are loaded dynamically from AWS Secrets Manager at runtime.

---

## 🚀 Deployment Checklist

### Setup (One-time)

- [ ] Create `fl-auth-service-secrets` in AWS Secrets Manager (production)
- [ ] Create `dev-fl-auth-service-secrets` in AWS Secrets Manager (dev)
- [ ] Update Lambda IAM role with Secrets Manager permissions
- [ ] Create `dev-fl-auth-service-lambda` Lambda function (if not exists)
- [ ] Ensure both Lambda functions have Node.js 18 runtime

### Before First Deployment

- [ ] Push to `main` branch
- [ ] Verify GitHub Actions workflow runs successfully
- [ ] Check CloudWatch logs for "Successfully loaded secrets"
- [ ] Test endpoints with production data

- [ ] Push to `dev` branch
- [ ] Verify dev deployment works
- [ ] Confirm using dev secrets (different Neo4j instance)

### Ongoing

- [ ] Secrets in AWS Secrets Manager are kept in sync with needs
- [ ] Monitor CloudWatch logs for any "Failed to load secrets" errors
- [ ] Update secrets when credentials rotate

---

## 🔍 Troubleshooting

### "Failed to load secrets from AWS Secrets Manager"

**Cause:** IAM role doesn't have permissions

**Fix:** Update Lambda IAM role with `secretsmanager:GetSecretValue` permission

### "Secret not found: JWT_SECRET"

**Cause:** Secret doesn't exist or wrong JSON structure

**Fix:** Create secret with exact keys: `JWT_SECRET`, `PEPPER`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`

### CloudWatch Logs Show "Invalid or expired token"

**Cause:** Token was signed with different JWT_SECRET (secret changed?)

**Fix:** Clear browser/client cache, re-login to get token with new secret

### Dev and prod deployments are using same secrets

**Cause:** Wrong secret name loaded

**Fix:** Verify Lambda functions are named correctly:
- Production: `fl-auth-service-lambda` → loads `fl-auth-service-secrets`
- Development: `dev-fl-auth-service-lambda` → loads `dev-fl-auth-service-secrets`

---

## 📚 Additional Resources

- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/latest/developer-guide/)
- [Lambda IAM Permissions](https://docs.aws.amazon.com/lambda/latest/dg/lambda-permissions.html)

---

## 🎯 Summary

✅ **Secrets now loaded from AWS Secrets Manager** (not environment variables)  
✅ **Two deployment branches** (main → prod, dev → dev)  
✅ **Automatic secret switching** based on Lambda function name  
✅ **Cached secrets** for optimal Lambda performance  
✅ **Full TypeScript support** with type-safe secrets  
✅ **Better security** - secrets never exposed in code or GitHub  
