# FL Auth Service Lambda

A production-ready serverless authentication microservice built with Express.js, AWS Lambda, Neo4j, and TypeScript. Supports up to 10,000 concurrent users with email notifications and dual-environment deployment.

## 🚀 Features

- **Express.js Framework**: Full Express.js routing with middleware chain
- **7 Authentication Routes**: Signup, login, verify, refresh token, password setup, password reset, account deletion
- **AWS Secrets Manager**: Secure credential management with caching
- **Email Notifications**: Integrated with FLC Notify Service Lambda
- **Dual Environment**: Automatic main/dev branch deployment
- **Production-Ready**: Error handling, request logging, CORS, validation
- **Type Safety**: Full TypeScript implementation with strict mode
- **Neo4j Database**: Graph database for user management
- **Security**: bcrypt + pepper, JWT tokens, Zod validation

## 📁 Project Structure

```
fl-auth-lambda/
├── src/
│   ├── index.ts                    # Lambda entry point with serverless-http
│   ├── app.ts                      # Express app with routes & middleware
│   ├── middleware/
│   │   ├── errorHandler.ts         # Global error handling
│   │   ├── requestLogger.ts        # Request ID tracking & logging
│   │   ├── bodyParser.ts           # JSON parsing & validation
│   │   └── cors.ts                 # CORS configuration
│   ├── routes/
│   │   ├── signup.ts               # User registration + welcome email
│   │   ├── login.ts                # User authentication
│   │   ├── verify.ts               # Token verification
│   │   ├── refreshToken.ts         # Token refresh
│   │   ├── setupPassword.ts        # First-time password setup
│   │   ├── resetPassword.ts        # Password change + confirmation email
│   │   └── deleteAccount.ts        # Account deletion + confirmation email
│   ├── utils/
│   │   ├── auth.ts                 # Async JWT & password utilities
│   │   ├── secrets.ts              # AWS Secrets Manager integration
│   │   ├── notifications.ts        # Email service integration
│   │   ├── response.ts             # Lambda response helpers
│   │   └── validation.ts           # Zod schemas
│   ├── db/
│   │   └── neo4j.ts                # Neo4j connection with Secrets Manager
│   └── types/
│       └── index.ts                # TypeScript interfaces
├── .github/workflows/
│   └── deploy.yml                  # Dual-branch deployment workflow
├── serverless.yml                  # Serverless Framework config
├── tsconfig.json                   # TypeScript strict configuration
├── package.json                    # Dependencies & scripts
├── DEPLOYMENT.md                   # Deployment guide
├── EXPRESS_IMPLEMENTATION.md       # Express architecture details
├── SECRETS_MANAGER_SETUP.md        # AWS Secrets setup
├── NOTIFICATION_SERVICE.md         # Email integration guide
└── AWS_SETUP_NOTIFICATION.md       # AWS notification config
```

## 🎯 Architecture

### Request Flow
```
API Gateway → Lambda → Express App → Middleware Chain → Route Handler
                                      ↓
                         [RequestID → CORS → BodyParser → Logger]
                                      ↓
                         Route Handler (with asyncHandler wrapper)
                                      ↓
                         Error Handler (global catch)
```

### Middleware Chain
1. **Request ID**: Generates unique ID for request tracking
2. **CORS**: Handles cross-origin requests
3. **Body Parser**: Parses JSON with size limits
4. **Request Logger**: Logs request details
5. **Route Handlers**: Process auth operations
6. **Error Handler**: Catches and formats all errors

## 🔧 Setup

### Prerequisites

- Node.js 18+
- AWS CLI configured with appropriate credentials
- Neo4j database (AuraDB or self-hosted)
- GitHub repository with Actions enabled

### Installation

1. **Clone and install**:
```bash
git clone https://github.com/firstlovecenter/fl-auth-lambda.git
cd fl-auth-lambda
npm install
```

2. **Configure AWS Secrets Manager**:

Create production secret:
```bash
aws secretsmanager create-secret \
  --name fl-auth-service-secrets \
  --secret-string '{
    "JWT_SECRET": "your-strong-jwt-secret-min-32-chars",
    "PEPPER": "your-pepper-string-for-password-hashing",
    "NEO4J_URI": "neo4j+s://your-instance.databases.neo4j.io",
    "NEO4J_USER": "neo4j",
    "NEO4J_PASSWORD": "your-neo4j-password",
    "NOTIFICATION_SECRET_KEY": "your-notification-service-key",
    "ENVIRONMENT": "production"
  }' \
  --region eu-west-2
```

Create development secret:
```bash
aws secretsmanager create-secret \
  --name dev-fl-auth-service-secrets \
  --secret-string '{
    "JWT_SECRET": "your-dev-jwt-secret",
    "PEPPER": "your-dev-pepper",
    "NEO4J_URI": "neo4j+s://your-dev-instance.databases.neo4j.io",
    "NEO4J_USER": "neo4j",
    "NEO4J_PASSWORD": "your-dev-password",
    "NOTIFICATION_SECRET_KEY": "your-notification-service-key",
    "ENVIRONMENT": "development"
  }' \
  --region eu-west-2
```

See [SECRETS_MANAGER_SETUP.md](SECRETS_MANAGER_SETUP.md) for detailed instructions.

3. **Configure IAM Permissions**:

Ensure Lambda execution role has:
- SecretsManager read access
- Lambda invoke permission for notification service

See [AWS_SETUP_NOTIFICATION.md](AWS_SETUP_NOTIFICATION.md) for IAM setup.

4. **Build**:
```bash
npm run build
```

## 🚢 Deployment

### Automated Deployment (Recommended)

Push to GitHub to trigger automatic deployment:

```bash
# Deploy to production
git push origin main

# Deploy to development
git checkout dev
git merge main
git push origin dev
```

The GitHub Actions workflow automatically:
- Determines environment from branch
- Installs dependencies
- Builds TypeScript
- Packages Lambda function
- Deploys to appropriate environment

See [DEPLOYMENT.md](DEPLOYMENT.md) for details.

### Manual Deployment

```bash
# Deploy to production
serverless deploy --stage prod

# Deploy to development  
serverless deploy --stage dev
```

## 📡 API Endpoints

Base URL: `https://your-api-gateway-url`

### 1. Signup
```http
POST /auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response**:
```json
{
  "message": "User created successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

Sends welcome email automatically.

### 2. Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response**:
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### 3. Verify Token
```http
POST /auth/verify
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response**:
```json
{
  "message": "Token is valid",
  "user": {
    "userId": "uuid",
    "email": "user@example.com"
  }
}
```

### 4. Refresh Token

### 4. Refresh Token
```http
POST /auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response**:
```json
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### 5. Setup Password
```http
POST /auth/setup-password
Content-Type: application/json

{
  "email": "user@example.com",
  "token": "setup-token-from-email",
  "password": "NewSecurePass123!"
}
```

For migrated users setting their password for the first time.

### 6. Reset Password
```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

Sends password reset confirmation email.

### 7. Delete Account
```http
DELETE /auth/delete-account
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "confirmDeletion": true
}
```

Sends account deletion confirmation email.

## 🔒 Security Features

### Password Security
- **bcrypt hashing**: 12 rounds (computationally expensive)
- **Pepper**: Additional secret layer beyond salt
- **Async operations**: Non-blocking password operations
- **Minimum length**: 8 characters enforced

### JWT Tokens
- **Access tokens**: 30-minute expiration
- **Refresh tokens**: 7-day expiration
- **Async signing/verification**: Loaded from Secrets Manager
- **HS256 algorithm**: Industry standard

### Input Validation
- **Zod schemas**: Type-safe request validation
- **Email validation**: RFC-compliant email checking
- **Password requirements**: Enforced minimums
- **Request size limits**: 100kb limit on body parser

### Infrastructure Security
- **AWS Secrets Manager**: No secrets in code or environment variables
- **Secret caching**: Reduces API calls, improves performance
- **IAM roles**: Principle of least privilege
- **HTTPS only**: API Gateway enforces SSL/TLS

## 📧 Email Notifications

The service integrates with FLC Notify Service Lambda for transactional emails:

| Event | Email Sent |
|-------|-----------|
| Signup | Welcome email with account confirmation |
| Password Reset | Password change confirmation |
| Account Deletion | Account deletion confirmation |

Emails are sent asynchronously (non-blocking). Failed emails are logged but don't fail the request.

See [NOTIFICATION_SERVICE.md](NOTIFICATION_SERVICE.md) for details.

## 🌍 Environment Management

### Production Environment
- **Branch**: `main`
- **Lambda**: `fl-auth-service-lambda`
- **Secret**: `fl-auth-service-secrets`
- **Notification Lambda**: `flc-notify-service`

### Development Environment
- **Branch**: `dev`
- **Lambda**: `dev-fl-auth-service-lambda`
- **Secret**: `dev-fl-auth-service-secrets`
- **Notification Lambda**: `dev-flc-notify-service`

Environment is determined by the `ENVIRONMENT` value in AWS Secrets Manager (`"production"` or `"development"`).

## 🗄️ Database Schema

Neo4j graph database with Member nodes:

```cypher
(:Member {
  id: String (UUID),
  email: String (unique, indexed),
  password: String (bcrypt hashed),
  firstName: String,
  lastName: String,
  createdAt: DateTime,
  updatedAt: DateTime,
  lastLoginAt: DateTime
})
```

### Required Indexes
```cypher
CREATE CONSTRAINT member_email_unique IF NOT EXISTS
FOR (m:Member) REQUIRE m.email IS UNIQUE;

CREATE INDEX member_id IF NOT EXISTS
FOR (m:Member) ON (m.id);
```

## 🔧 Configuration

### Environment Variables

Set in Lambda configuration (not in code):

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | AWS region for services | `eu-west-2` |
| `AWS_SECRET_NAME` | Secrets Manager secret name | `fl-auth-service-secrets` |
| `NODE_ENV` | Node environment | `production` |

### AWS Secrets Manager

Required secrets (stored in `fl-auth-service-secrets` or `dev-fl-auth-service-secrets`):

| Secret Key | Description | Example |
|------------|-------------|---------|
| `JWT_SECRET` | JWT signing key (min 32 chars) | Random string |
| `PEPPER` | Password hashing pepper | Random string |
| `NEO4J_URI` | Neo4j connection URI | `neo4j+s://xxx.databases.neo4j.io` |
| `NEO4J_USER` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | Your password |
| `NOTIFICATION_SECRET_KEY` | Notification service auth key | Shared secret |
| `ENVIRONMENT` | Environment identifier | `production` or `development` |

## 📊 Monitoring & Debugging

### CloudWatch Logs

View logs for production:
```bash
aws logs tail /aws/lambda/fl-auth-service-lambda --follow
```

View logs for development:
```bash
aws logs tail /aws/lambda/dev-fl-auth-service-lambda --follow
```

### Common Log Patterns

**Successful Request**:
```
[REQUEST_ID] POST /auth/login
Email sent successfully to user@example.com
```

**Error**:
```
[REQUEST_ID] Error: Invalid credentials
Failed to send welcome email: Error: ...
```

### Metrics to Monitor

- **Invocations**: Total Lambda invocations
- **Errors**: Failed requests (4xx, 5xx)
- **Duration**: Request latency
- **Concurrent Executions**: Active instances
- **Throttles**: Rate limit hits

## 🧪 Testing

### Manual Testing

Use the provided curl commands or tools like Postman:

```bash
# Signup
curl -X POST https://your-api-gateway-url/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User"
  }'

# Login
curl -X POST https://your-api-gateway-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

### Unit Tests

```bash
npm test
```

## 🚨 Error Handling

The service uses a centralized error handler with standardized responses:

### Error Response Format
```json
{
  "error": "Error message",
  "statusCode": 400,
  "requestId": "uuid"
}
```

### Common Error Codes

| Code | Meaning | Example |
|------|---------|---------|
| 400 | Bad Request | Invalid email format |
| 401 | Unauthorized | Invalid credentials |
| 404 | Not Found | User not found |
| 409 | Conflict | Email already exists |
| 500 | Server Error | Database connection failed |

## 📚 Additional Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Detailed deployment guide
- **[EXPRESS_IMPLEMENTATION.md](EXPRESS_IMPLEMENTATION.md)**: Express architecture details
- **[SECRETS_MANAGER_SETUP.md](SECRETS_MANAGER_SETUP.md)**: AWS Secrets Manager setup
- **[NOTIFICATION_SERVICE.md](NOTIFICATION_SERVICE.md)**: Email integration guide
- **[AWS_SETUP_NOTIFICATION.md](AWS_SETUP_NOTIFICATION.md)**: AWS notification configuration

## 🛠️ Development

### Local Development

The service runs on AWS Lambda and uses AWS services, so local development requires:

1. AWS credentials configured
2. Access to Neo4j database
3. AWS Secrets Manager access

### Project Scripts

```bash
npm run build          # Compile TypeScript
npm run deploy         # Deploy to AWS
npm test              # Run tests
npm run lint          # Lint code
```

### Adding New Routes

1. Create route handler in `src/routes/`
2. Import and register in `src/app.ts`
3. Add Zod validation schema
4. Update this README with endpoint documentation

Example:
```typescript
// src/routes/newRoute.ts
import { Request, Response } from 'express'
import { asyncHandler } from '../middleware/errorHandler'

export const newRoute = asyncHandler(async (req: Request, res: Response) => {
  // Your logic here
  res.json({ message: 'Success' })
})

// src/app.ts
import { newRoute } from './routes/newRoute'
app.post('/auth/new-route', newRoute)
```

## 🤝 Contributing

1. Create a feature branch from `dev`
2. Make your changes
3. Test thoroughly
4. Submit a pull request to `dev` branch
5. After review, merge to `dev` then `main`

## 📝 License

MIT

## 👥 Support

For issues or questions:
- Check documentation in `/docs`
- Review CloudWatch logs
- Contact the development team

## 🔄 Version History

- **v1.0.0**: Initial Express.js implementation with 7 routes
- **v1.1.0**: AWS Secrets Manager integration
- **v1.2.0**: Email notification service integration
- **v1.3.0**: Dual-environment deployment (main/dev)

---

**Production Lambda**: `fl-auth-service-lambda`  
**Development Lambda**: `dev-fl-auth-service-lambda`  
**Region**: `eu-west-2` (Europe - London)
