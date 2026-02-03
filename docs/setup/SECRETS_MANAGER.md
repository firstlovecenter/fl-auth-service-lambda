# AWS Secrets Manager & Dual-Branch Deployment

Configure AWS to support automatic deployment to production or development based on git branch.

## Overview

- **Secrets Storage**: All credentials loaded from AWS Secrets Manager (not environment variables)
- **Dual Deployment**: `main` branch → production, `dev` branch → development  
- **Automatic Selection**: Lambda automatically loads correct secret based on function name
- **Zero-Config Secrets**: No need to set Lambda environment variables

## Prerequisites

- AWS Account with admin or appropriate IAM permissions
- AWS CLI installed and configured
- Access to your AWS Account ID

## Step 1: Create Secrets in AWS Secrets Manager

You need to create **two secrets** - one for production, one for development.

### Create Production Secret

```bash
aws secretsmanager create-secret \
  --name fl-auth-service-secrets \
  --description "Production secrets for FL Auth Lambda" \
  --secret-string '{
    "NEO4J_URI": "bolt://production-neo4j.firstlovecenter.com:7687",
    "NEO4J_USER": "neo4j",
    "NEO4J_PASSWORD": "your-production-neo4j-password",
    "JWT_SECRET": "your-production-jwt-secret-key-here",
    "PEPPER": "your-production-pepper-here",
    "NOTIFICATION_SECRET_KEY": "your-notification-key",
    "ENVIRONMENT": "production"
  }' \
  --region eu-west-2
```

### Create Development Secret

```bash
aws secretsmanager create-secret \
  --name dev-fl-auth-service-secrets \
  --description "Development secrets for FL Auth Lambda" \
  --secret-string '{
    "NEO4J_URI": "bolt://dev-neo4j.firstlovecenter.com:7687",
    "NEO4J_USER": "neo4j",
    "NEO4J_PASSWORD": "your-dev-neo4j-password",
    "JWT_SECRET": "your-dev-jwt-secret-key-here",
    "PEPPER": "your-dev-pepper-here",
    "NOTIFICATION_SECRET_KEY": "your-notification-key",
    "ENVIRONMENT": "development"
  }' \
  --region eu-west-2
```

**Important**: Replace all placeholder values with actual secrets.

## Step 2: Update Secrets (If Needed)

Update an existing secret:

```bash
aws secretsmanager update-secret \
  --secret-id fl-auth-service-secrets \
  --secret-string '{...}' \
  --region eu-west-2
```

View current secret (without value):
```bash
aws secretsmanager describe-secret --secret-id fl-auth-service-secrets --region eu-west-2
```

## Step 3: Configure Lambda IAM Role

Your Lambda functions need permission to read from Secrets Manager.

### Find Your Lambda Function's Role

```bash
# Production
aws lambda get-function \
  --function-name fl-auth-service-lambda \
  --query 'Configuration.Role' \
  --region eu-west-2

# Development
aws lambda get-function \
  --function-name dev-fl-auth-service-lambda \
  --query 'Configuration.Role' \
  --region eu-west-2
```

This returns an ARN like: `arn:aws:iam::123456789012:role/lambda-role-name`

### Create or Update IAM Policy

Create a JSON file called `secrets-policy.json`:

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

Replace `YOUR-ACCOUNT-ID` with your actual AWS account ID.

Attach the policy to the Lambda role:

```bash
# Get your account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Update the policy file with real account ID
sed -i "s/YOUR-ACCOUNT-ID/$AWS_ACCOUNT_ID/g" secrets-policy.json

# Create the policy
aws iam create-policy \
  --policy-name lambda-secrets-manager-access \
  --policy-document file://secrets-policy.json

# Attach to Lambda role (replace role-name with actual role)
aws iam attach-role-policy \
  --role-name YOUR-LAMBDA-ROLE-NAME \
  --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/lambda-secrets-manager-access
```

## How Secret Selection Works

The Lambda code automatically detects which secret to load based on the **Lambda function name**:

| Lambda Function Name | Secret Name | Environment |
|-----|-----|-----|
| `fl-auth-service-lambda` | `fl-auth-service-secrets` | Production |
| `dev-fl-auth-service-lambda` | `dev-fl-auth-service-secrets` | Development |

Code in `src/utils/secrets.ts` handles this:
```typescript
const functionName = context.functionName
const secretName = functionName.includes('dev') 
  ? 'dev-fl-auth-service-secrets' 
  : 'fl-auth-service-secrets'
```

## GitHub Actions Deployment

The automated workflow in `.github/workflows/deploy.yml`:

1. **Push to `main` branch**
   - Builds code
   - Deploys to `fl-auth-service-lambda` function
   - Lambda loads `fl-auth-service-secrets`
   - Uses production Neo4j database

2. **Push to `dev` branch**
   - Builds code
   - Deploys to `dev-fl-auth-service-lambda` function
   - Lambda loads `dev-fl-auth-service-secrets`
   - Uses development Neo4j database

## Testing Secret Access

Verify secrets are configured correctly:

```bash
# Test reading production secret
aws secretsmanager get-secret-value \
  --secret-id fl-auth-service-secrets \
  --region eu-west-2 \
  --query SecretString \
  --output text | jq .

# Test reading dev secret
aws secretsmanager get-secret-value \
  --secret-id dev-fl-auth-service-secrets \
  --region eu-west-2 \
  --query SecretString \
  --output text | jq .
```

## Rotating Secrets

To rotate secrets without downtime:

1. **Update the secret** with new credentials:
   ```bash
   aws secretsmanager update-secret \
     --secret-id fl-auth-service-secrets \
     --secret-string '{...new values...}' \
     --region eu-west-2
   ```

2. **Secrets are cached** in Lambda container, so:
   - Currently running Lambdas will continue using old secrets
   - New Lambdas (after next deployment) will use new secrets
   - Cold starts will load fresh secrets

3. **To force immediate rotation**: Redeploy Lambda
   ```bash
   git push origin main  # Triggers deployment
   ```

## Troubleshooting

### "Failed to load secrets from AWS Secrets Manager"

**Possible Causes:**
1. IAM role doesn't have `secretsmanager:GetSecretValue` permission
2. Secret name is wrong
3. Secret doesn't exist
4. Wrong region

**Solutions:**
```bash
# 1. Verify secret exists
aws secretsmanager describe-secret --secret-id fl-auth-service-secrets --region eu-west-2

# 2. Verify IAM permissions
aws iam get-user-policy --user-name YOUR-USER-NAME --policy-name YOUR-POLICY-NAME

# 3. Check Lambda function role has correct ARN
aws lambda get-function --function-name fl-auth-service-lambda --region eu-west-2
```

### "Invalid JSON in secret"

Secrets must be valid JSON. Test with:
```bash
aws secretsmanager get-secret-value \
  --secret-id fl-auth-service-secrets \
  --region eu-west-2 \
  --query SecretString | python3 -m json.tool
```

### "Wrong database connected (dev vs prod)"

Check which Lambda function is running and which secret it's using:
1. Look at CloudWatch logs for function name
2. Verify `ENVIRONMENT` value in returned secret
3. Ensure correct secret was created

## Security Best Practices

✅ **Do:**
- Store all secrets in AWS Secrets Manager
- Use different secrets for dev and production
- Rotate secrets regularly
- Use IAM roles with least-privilege permissions
- Log all secret access in CloudTrail

❌ **Don't:**
- Commit secrets to Git (even with `.gitignore`)
- Store secrets in Lambda environment variables
- Share AWS credentials
- Use the same secret for dev and production
- Disable encryption for secrets

## Next Steps

1. **Deploy to Production** → [Deployment Guide](./DEPLOYMENT.md)
2. **Understand the Architecture** → [Architecture Overview](../architecture/OVERVIEW.md)
3. **Configure Notifications** → [Notification Service](../architecture/NOTIFICATIONS.md)

---

**See Also:**
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [AWS Lambda IAM Roles](https://docs.aws.amazon.com/lambda/latest/dg/lambda-permissions.html)
