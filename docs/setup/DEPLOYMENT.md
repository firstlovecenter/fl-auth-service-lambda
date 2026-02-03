# Deployment Guide

Deploy the Auth Lambda to AWS.

## Prerequisites

Before deploying, ensure:
- ✅ Node.js 18+ installed locally
- ✅ AWS credentials configured (`aws configure`)
- ✅ Secrets created in AWS Secrets Manager (see [Secrets Setup](./SECRETS_MANAGER.md))
- ✅ Lambda IAM role has Secrets Manager permissions
- ✅ Code passes TypeScript checks: `npm run type-check`

## Automatic Deployment (GitHub Actions)

**Recommended**: Use automatic deployment via GitHub Actions.

### How It Works

```
Push code to repository
    ↓
GitHub Actions workflow triggered
    ↓
Detect branch (main or dev)
    ↓
Build and test code
    ↓
Deploy to appropriate Lambda function
    ↓
Slack notification with status
```

### Deployment by Branch

| Push to Branch | Deploys to | Uses Secret | Environment |
|---|---|---|---|
| `main` | `fl-auth-service-lambda` | `fl-auth-service-secrets` | Production |
| `dev` | `dev-fl-auth-service-lambda` | `dev-fl-auth-service-secrets` | Development |

### Make a Deployment

```bash
# Deploy to production
git push origin main

# Deploy to development
git push origin dev
```

Monitor deployment:
1. Go to repository → Actions tab
2. Watch workflow run
3. Check Slack for notification (if configured)
4. Verify in CloudWatch logs

## Manual Deployment

If you need to deploy manually:

### 1. Build the Code

```bash
npm run build
```

This creates `dist/` directory with compiled JavaScript.

### 2. Create ZIP Package

```bash
# Include source code and node_modules
zip -r lambda-deployment.zip dist/ node_modules/ package.json package-lock.json
```

### 3. Deploy to AWS

#### Using Serverless Framework (Recommended)

```bash
# Install serverless globally (one-time)
npm install -g serverless

# Deploy to production
serverless deploy --aws-profile default

# Deploy to development
serverless deploy --stage dev --aws-profile default
```

#### Using AWS CLI

```bash
# Production
aws lambda update-function-code \
  --function-name fl-auth-service-lambda \
  --zip-file fileb://lambda-deployment.zip \
  --region eu-west-2

# Development
aws lambda update-function-code \
  --function-name dev-fl-auth-service-lambda \
  --zip-file fileb://lambda-deployment.zip \
  --region eu-west-2
```

### 4. Verify Deployment

Check CloudWatch logs:

```bash
# Production
aws logs tail /aws/lambda/fl-auth-service-lambda --follow --region eu-west-2

# Development
aws logs tail /aws/lambda/dev-fl-auth-service-lambda --follow --region eu-west-2
```

Look for: `✅ Successfully loaded secrets` or `✅ Successfully connected to Neo4j`

## Deployment Checklist

Before deploying to production:

- [ ] Code committed and pushed
- [ ] `npm run type-check` passes (no TypeScript errors)
- [ ] `npm test` passes (tests green)
- [ ] Reviewed changes in git diff
- [ ] Secrets configured in AWS Secrets Manager
- [ ] Lambda IAM role has correct permissions
- [ ] Verified on development environment first

For production deployment specifically:

- [ ] Tested on `dev` branch first
- [ ] Database migration completed (if needed)
- [ ] Verified all auth flows work in dev
- [ ] Planning maintenance window if needed
- [ ] Have rollback plan ready

## Post-Deployment Verification

After deploying:

### 1. Check CloudWatch Logs

```bash
# Production
aws logs tail /aws/lambda/fl-auth-service-lambda --follow --region eu-west-2

# Look for these messages:
# ✅ Successfully loaded secrets
# ✅ Successfully connected to Neo4j
# ✅ Listening on port 3000
```

### 2. Test an Endpoint

```bash
# Get the API Gateway URL (check AWS console or GitHub Actions output)
API_URL="https://your-api-gateway-url/auth"

# Test signup endpoint
curl -X POST $API_URL/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "firstName": "Test"
  }'
```

### 3. Monitor for Errors

Watch CloudWatch for the next few minutes:
- Look for any database connection errors
- Check for "Failed to load secrets" messages
- Monitor error rate spike

## Rollback

If something goes wrong:

### Quick Rollback (Previous Version)

```bash
# Using Serverless Framework
serverless rollback --aws-profile default

# Using AWS CLI (redeploy previous code)
git revert HEAD
git push origin main  # Will trigger re-deployment with previous code
```

### Manual Rollback

If you have a backup of the previous deployment:

```bash
aws lambda update-function-code \
  --function-name fl-auth-service-lambda \
  --zip-file fileb://previous-deployment.zip \
  --region eu-west-2
```

## Database Migrations During Deployment

If you're deploying with database changes:

### Migration Script

```bash
# Test on development database first
npm run migrate:members-to-users -- --environment development --dry-run

# Run actual migration
npm run migrate:members-to-users -- --environment development

# Verify migration completed
npm run migrate:members-to-users -- --environment development
```

See [Database Migrations Guide](../guides/DATABASE_MIGRATIONS.md) for full details.

## Environment-Specific Configuration

### Production (`main` branch)

- Function: `fl-auth-service-lambda`
- Secret: `fl-auth-service-secrets`
- Database: Production Neo4j
- Notifications: Production email service
- Logs: `/aws/lambda/fl-auth-service-lambda`

### Development (`dev` branch)

- Function: `dev-fl-auth-service-lambda`
- Secret: `dev-fl-auth-service-secrets`
- Database: Development Neo4j (@ dev-neo4j.firstlovecenter.com)
- Notifications: Development email service
- Logs: `/aws/lambda/dev-fl-auth-service-lambda`

## Troubleshooting

### "Function deployed but returning 500 errors"

1. Check CloudWatch logs for "Failed to load secrets"
2. Verify IAM role has `secretsmanager:GetSecretValue` permission
3. Verify secret exists: `aws secretsmanager describe-secret --secret-id fl-auth-service-secrets`

### "Cannot connect to Neo4j"

1. Check database credentials in secret
2. Verify database is accessible: `nc -zv your-neo4j-host 7687`
3. Check database logs for connection errors
4. Verify security groups allow Lambda to database

### "Previous version works, new version doesn't"

```bash
# Check what changed
git diff HEAD~1

# Rollback if needed
git revert HEAD
git push origin main
```

### "Deployment hangs or times out"

1. Check GitHub Actions logs for errors
2. Verify AWS credentials are configured
3. Check if Lambda has network access (VPC/security groups)
4. Check CloudWatch for any permissions errors

## Monitoring After Deployment

### Set Up CloudWatch Alarms

```bash
# High error rate
aws cloudwatch put-metric-alarm \
  --alarm-name fl-auth-lambda-errors \
  --alarm-description "Alert on Lambda errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=fl-auth-service-lambda
```

### Monitor Key Metrics

- **Error Rate**: Should be near 0%
- **Duration**: Typical: 100-500ms
- **Concurrency**: Scale based on load
- **Cold Starts**: First request takes longer

## Next Steps

- [Database Migrations](../guides/DATABASE_MIGRATIONS.md) - Run migrations if needed
- [Monitor with CloudWatch](../architecture/OVERVIEW.md#monitoring) - Set up alerts
- [Configure Notifications](../architecture/NOTIFICATIONS.md) - Set up email service

---

**See Also:**
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Serverless Framework Guide](https://www.serverless.com/framework/docs)
- [AWS CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/)
