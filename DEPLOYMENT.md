# Deployment Guide - Auth Lambda

This document explains how to deploy the Auth Lambda microservice to AWS.

## Prerequisites

- AWS Account with appropriate IAM permissions
- Node.js 18+
- Serverless Framework CLI
- AWS CLI (optional, for manual deployments)

## Setup

### 1. Install Serverless Framework (Local Development)

```bash
npm install -g serverless
```

### 2. Configure AWS Credentials

#### Option A: Using AWS CLI
```bash
aws configure
```

#### Option B: Using Environment Variables
```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=eu-west-2  # or your preferred region
```

#### Option C: Using Named Profiles
```bash
serverless deploy --aws-profile your-profile-name
```

### 3. Set Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
NEO4J_URI=bolt://your-neo4j-instance:7687
NEO4J_USER=your_neo4j_user
NEO4J_PASSWORD=your_neo4j_password
JWT_SECRET=your_jwt_secret_key
PEPPER=your_pepper_value
AWS_REGION=eu-west-2
```

**Note:** The `.env` file is loaded automatically by `serverless-dotenv-plugin`.

## Deployment Methods

### Method 1: Local Deployment

```bash
# Build TypeScript and deploy
npm run deploy

# Or explicitly:
npm run build
serverless deploy
```

### Method 2: GitHub Actions (Automated)

The workflow is configured to deploy automatically on pushes to the `main` branch.

#### Setup GitHub Secrets

Add the following secrets to your GitHub repository settings:

1. `AWS_ACCESS_KEY_ID` - AWS IAM access key
2. `AWS_SECRET_ACCESS_KEY` - AWS IAM secret access key
3. `AWS_REGION` - AWS region (e.g., `eu-west-2`)
4. `NEO4J_URI` - Neo4j database URI
5. `NEO4J_USER` - Neo4j username
6. `NEO4J_PASSWORD` - Neo4j password
7. `JWT_SECRET` - JWT signing secret
8. `PEPPER` - Password hashing pepper value
9. `SLACK_WEBHOOK` (optional) - Slack webhook URL for notifications

To add secrets:

1. Go to your repository on GitHub
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret with its corresponding value

### Method 3: Scheduled Deployments

To deploy on a schedule, modify `.github/workflows/deploy.yml`:

```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
```

## Deployment Verification

After deployment, verify your Lambda functions are running:

```bash
# List all auth-lambda functions
aws lambda list-functions --query "Functions[?contains(FunctionName, 'auth-lambda')]"

# Test a specific function
aws lambda invoke \
  --function-name auth-lambda-dev-signup \
  --payload '{}' \
  response.json

cat response.json
```

## Monitoring and Logs

### View CloudWatch Logs

```bash
# View recent logs
aws logs tail /aws/lambda/auth-lambda-dev-signup --follow

# View logs from a specific time
aws logs tail /aws/lambda/auth-lambda-dev-signup --since 30m
```

### Check Function Metrics

In the AWS Console:
1. Go to Lambda → Functions
2. Select your function
3. Click the "Monitoring" tab to view CloudWatch metrics

## Troubleshooting

### Deployment Fails with Permission Denied

- Verify IAM user has permissions: `lambda:UpdateFunctionCode`, `lambda:CreateFunction`, `iam:PassRole`, `s3:CreateBucket`
- Check AWS credentials are correctly configured

### Environment Variables Not Loading

- Verify `.env` file exists in the root directory
- Check that `useDotenv: true` is set in `serverless.yml`
- Ensure GitHub secrets are correctly configured for CI/CD

### Lambda Function Timeout

- Increase timeout in `serverless.yml`:
  ```yaml
  provider:
    timeout: 30  # seconds
  ```

### Neo4j Connection Failures

- Verify `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD` are correct
- Check that the Neo4j instance is accessible from AWS Lambda VPC
- Ensure security groups allow outbound connections to Neo4j

## Rollback

### Rollback to Previous Version

```bash
# List previous versions
aws lambda list-versions-by-function --function-name auth-lambda-dev-signup

# Update function code to a previous version
aws lambda update-function-code \
  --function-name auth-lambda-dev-signup \
  --s3-bucket your-bucket \
  --s3-key path/to/previous/zip
```

### Automatic Rollback with Serverless

Serverless Framework supports automatic rollback on failed deployments:

```bash
serverless deploy --function signup  # Deploy single function
```

## Best Practices

1. **Always test locally first:**
   ```bash
   npm run build
   serverless offline start
   ```

2. **Use environment-specific configurations:**
   - Create separate AWS accounts or use deployment stages: `serverless deploy --stage prod`

3. **Monitor deployments:**
   - Set up CloudWatch alarms for error rates and duration
   - Enable X-Ray tracing for debugging

4. **Version your deployments:**
   - Tag commits when deploying to production
   - Keep a changelog of significant deployments

5. **Security:**
   - Rotate AWS access keys regularly
   - Use IAM roles instead of access keys when possible
   - Never commit `.env` or secrets to version control

## Additional Resources

- [Serverless Framework Documentation](https://www.serverless.com/framework/docs)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
