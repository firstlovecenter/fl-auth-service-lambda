# AWS Configuration Checklist

Complete these steps to enable notification service integration.

## 1. Update AWS Secrets Manager

Add the `NOTIFICATION_SECRET_KEY` to both production and development secrets.

### Production Secret
```bash
aws secretsmanager update-secret \
  --secret-id fl-auth-service-secrets \
  --secret-string '{
    "JWT_SECRET": "your-jwt-secret",
    "PEPPER": "your-pepper",
    "NEO4J_URI": "your-neo4j-uri",
    "NEO4J_USER": "your-neo4j-user",
    "NEO4J_PASSWORD": "your-neo4j-password",
    "NOTIFICATION_SECRET_KEY": "yoGca8BNGus7W3JhnETkKchYR3KJ3sah",
    "ENVIRONMENT": "production"
  }' \
  --region eu-west-2
```

### Development Secret
```bash
aws secretsmanager update-secret \
  --secret-id dev-fl-auth-service-secrets \
  --secret-string '{
    "JWT_SECRET": "your-dev-jwt-secret",
    "PEPPER": "your-dev-pepper",
    "NEO4J_URI": "your-dev-neo4j-uri",
    "NEO4J_USER": "your-dev-neo4j-user",
    "NEO4J_PASSWORD": "your-dev-neo4j-password",
    "NOTIFICATION_SECRET_KEY": "yoGca8BNGus7W3JhnETkKchYR3KJ3sah",
    "ENVIRONMENT": "development"
  }' \
  --region eu-west-2
```

## 2. Update Lambda IAM Role

Add Lambda invocation permissions to allow the auth service to call the notification service.

### Get Current Role Name
```bash
# Production
aws lambda get-function \
  --function-name fl-auth-service-lambda \
  --query 'Configuration.Role' \
  --output text

# Development
aws lambda get-function \
  --function-name dev-fl-auth-service-lambda \
  --query 'Configuration.Role' \
  --output text
```

### Create IAM Policy
Create a file `notification-invoke-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": [
        "arn:aws:lambda:eu-west-2:YOUR_ACCOUNT_ID:function:flc-notify-service",
        "arn:aws:lambda:eu-west-2:YOUR_ACCOUNT_ID:function:dev-flc-notify-service"
      ]
    }
  ]
}
```

Replace `YOUR_ACCOUNT_ID` with your AWS account ID.

### Attach Policy to Role
```bash
# Create the policy
aws iam create-policy \
  --policy-name FlcNotificationInvokePolicy \
  --policy-document file://notification-invoke-policy.json

# Attach to production role
aws iam attach-role-policy \
  --role-name YOUR_PROD_ROLE_NAME \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/FlcNotificationInvokePolicy

# Attach to development role
aws iam attach-role-policy \
  --role-name YOUR_DEV_ROLE_NAME \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/FlcNotificationInvokePolicy
```

## 3. Install Dependencies

Make sure to install the new dependency:
```bash
npm install
```

This will install `@aws-sdk/client-lambda` which was added to package.json.

## 4. Deploy Updated Lambda

Deploy using GitHub Actions:
```bash
# For production (main branch)
git add .
git commit -m "Add notification service integration"
git push origin main

# For development (dev branch)
git checkout dev
git merge main
git push origin dev
```

Or deploy manually:
```bash
# Build
npm run build

# Deploy production
serverless deploy --stage prod

# Deploy development
serverless deploy --stage dev
```

## 5. Verify Configuration

### Check Secrets
```bash
# Verify production secret contains NOTIFICATION_SECRET_KEY
aws secretsmanager get-secret-value \
  --secret-id fl-auth-service-secrets \
  --region eu-west-2 \
  --query 'SecretString' \
  --output text | jq .

# Verify development secret contains NOTIFICATION_SECRET_KEY
aws secretsmanager get-secret-value \
  --secret-id dev-fl-auth-service-secrets \
  --region eu-west-2 \
  --query 'SecretString' \
  --output text | jq .
```

### Test Email Sending
After deployment, test the integration by:

1. **Signup** - Create a new user account
   ```bash
   curl -X POST https://your-api-gateway-url/auth/signup \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "SecurePass123!",
       "firstName": "Test",
       "lastName": "User"
     }'
   ```
   Check for welcome email.

2. **Password Reset** - Change password for existing user
   ```bash
   curl -X POST https://your-api-gateway-url/auth/reset-password \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "currentPassword": "SecurePass123!",
       "newPassword": "NewSecurePass123!",
       "confirmPassword": "NewSecurePass123!"
     }'
   ```
   Check for password reset confirmation email.

3. **Check CloudWatch Logs** - Monitor email sending
   ```bash
   # Production logs
   aws logs tail /aws/lambda/fl-auth-service-lambda --follow
   
   # Development logs
   aws logs tail /aws/lambda/dev-fl-auth-service-lambda --follow
   ```

## 6. Monitoring

### CloudWatch Metrics
Monitor Lambda invocations:
```bash
# Check notification service invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=flc-notify-service \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

### Error Logs
Check for email sending errors:
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/fl-auth-service-lambda \
  --filter-pattern "Failed to send" \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

## Troubleshooting

### Email Not Sending
1. **Check IAM permissions** - Ensure Lambda can invoke notification service
2. **Verify secret key** - Confirm NOTIFICATION_SECRET_KEY is correct in Secrets Manager
3. **Check CloudWatch logs** - Look for error messages in Lambda logs
4. **Verify notification service** - Ensure flc-notify-service is deployed and working

### Permission Denied Errors
```
User: arn:aws:sts::ACCOUNT_ID:assumed-role/ROLE_NAME/FUNCTION_NAME is not authorized to perform: lambda:InvokeFunction
```
**Solution**: Attach the notification invoke policy to the Lambda execution role.

### Secret Not Found
```
Error: Secret 'NOTIFICATION_SECRET_KEY' not found
```
**Solution**: Update AWS Secrets Manager with the notification secret key.

## Quick Start Commands

```bash
# 1. Update secrets (replace values with actual secrets)
aws secretsmanager update-secret --secret-id fl-auth-service-secrets --secret-string '{"JWT_SECRET":"...","PEPPER":"...","NEO4J_URI":"...","NEO4J_USER":"...","NEO4J_PASSWORD":"...","NOTIFICATION_SECRET_KEY":"yoGca8BNGus7W3JhnETkKchYR3KJ3sah","ENVIRONMENT":"production"}' --region eu-west-2

aws secretsmanager update-secret --secret-id dev-fl-auth-service-secrets --secret-string '{"JWT_SECRET":"...","PEPPER":"...","NEO4J_URI":"...","NEO4J_USER":"...","NEO4J_PASSWORD":"...","NOTIFICATION_SECRET_KEY":"yoGca8BNGus7W3JhnETkKchYR3KJ3sah","ENVIRONMENT":"development"}' --region eu-west-2

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Deploy (or push to GitHub for automatic deployment)
git add .
git commit -m "Add notification service integration"
git push origin main
```

## Verification Checklist

- [ ] NOTIFICATION_SECRET_KEY added to production secret
- [ ] NOTIFICATION_SECRET_KEY added to development secret
- [ ] IAM policy created for Lambda invocation
- [ ] IAM policy attached to production Lambda role
- [ ] IAM policy attached to development Lambda role
- [ ] Dependencies installed (`npm install`)
- [ ] Code built successfully (`npm run build`)
- [ ] Lambda deployed (via GitHub Actions or serverless)
- [ ] Welcome email received on signup
- [ ] Password reset email received on password change
- [ ] CloudWatch logs showing successful email sends
