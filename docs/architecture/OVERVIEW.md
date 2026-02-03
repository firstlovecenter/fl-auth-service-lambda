# Architecture Overview

How the FL Auth Lambda system works.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Application                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP Requests
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                     AWS API Gateway                              │
│              (Routes to /auth/* endpoints)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Lambda Invoke
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│              AWS Lambda (Node.js 18 runtime)                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Express.js Application                                   │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Middleware Chain                                    │  │  │
│  │  │ • CORS Handling                                     │  │  │
│  │  │ • Request Logger (Request ID tracking)              │  │  │
│  │  │ • Body Parser (JSON validation with Zod)            │  │  │
│  │  │ • Error Handler (Consistent error responses)        │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                          ↓                                   │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Route Handler (7 endpoints)                         │  │  │
│  │  │ • POST /auth/signup          (Create account)       │  │  │
│  │  │ • POST /auth/login           (Authenticate)         │  │  │
│  │  │ • POST /auth/verify          (Verify token)         │  │  │
│  │  │ • POST /auth/refresh-token   (New access token)     │  │  │
│  │  │ • POST /auth/setup-password  (First-time setup)     │  │  │
│  │  │ • POST /auth/reset-password  (Change password)      │  │  │
│  │  │ • DELETE /auth/account       (Delete account)       │  │  │
│  │  └──────────────────┬──────────────────────────────────┘  │  │
│  │                     ↓                                       │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Utility Functions                                   │  │  │
│  │  │ • Password: Hash (bcrypt + pepper)                  │  │  │
│  │  │ • JWT: Sign & Verify tokens                         │  │  │
│  │  │ • Secrets: Load from AWS Secrets Manager            │  │  │
│  │  │ • Validation: Zod schema checking                   │  │  │
│  │  └──────────────────┬──────────────────────────────────┘  │  │
│  └─────────────────────┼──────────────────────────────────────┘  │
│                        │                                          │
│         ┌──────────────┼──────────────┐                           │
│         ↓              ↓              ↓                           │
└─────────┬──────────────┬──────────────┬────────────────────────┘
          │              │              │
   ┌──────↓──────┐ ┌─────↓────────┐ ┌──↓──────────────────┐
   │   Neo4j DB  │ │   AWS Secrets│ │ FLC Notify Service  │
   │             │ │   Manager    │ │ (Email Lambda)      │
   │ • Member    │ │              │ │                     │
   │   :User     │ │ • JWT Secret │ │ • Welcome email     │
   │   nodes     │ │ • Pepper     │ │ • Reset email       │
   │ • Passwords │ │ • DB creds   │ │ • Delete email      │
   │ • Tokens    │ │ • API keys   │ └─────────────────────┘
   └─────────────┘ └──────────────┘
```

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Node.js | 18+ |
| **Framework** | Express.js | 4.18+ |
| **Language** | TypeScript | 5.3+ |
| **Database** | Neo4j | 4.4+ |
| **Deployment** | AWS Lambda | - |
| **API Gateway** | AWS API Gateway | - |
| **Secrets** | AWS Secrets Manager | - |
| **Testing** | Jest | 30.2+ |
| **Validation** | Zod | - |
| **Password Hashing** | bcrypt | 5.1+ |
| **Auth** | JWT (jsonwebtoken) | 9.0+ |

## Data Flow

### User Signup

```
1. Client → POST /auth/signup { email, password, firstName }
2. Middleware → Validate with Zod schema
3. Handler → Hash password with bcrypt + pepper
4. Handler → Create Member:User node in Neo4j
5. Handler → Async email (fire-and-forget)
6. Response → 201 with tokens and user object
7. Email Service → Sends welcome email (async)
```

### User Login

```
1. Client → POST /auth/login { email, password }
2. Middleware → Validate email/password
3. Handler → Query User node by email
4. Handler → Compare password (bcrypt)
5. Handler → Check if password is NULL (new users)
   ↓
   ├─ If NULL: Return 401 with requiresPasswordSetup flag
   └─ If valid: Generate tokens, return 200
6. Response → { accessToken, refreshToken, user }
```

### Token Refresh

```
1. Client → POST /auth/refresh-token { refreshToken }
2. Handler → Verify JWT signature (async - loads secret)
3. Handler → Query User node to confirm exists
4. Handler → Generate new access token
5. Response → { accessToken, refreshToken, user }
```

### Password Setup (First Time)

```
1. Client → POST /auth/setup-password { email, token, password }
2. Handler → Verify setup token (JWT verification)
3. Handler → Query User by email with token
4. Handler → Check password is still NULL
5. Handler → Hash new password with bcrypt + pepper
6. Handler → Update User node with password
7. Response → 200 success
```

## Key Concepts

### Dual-Label Structure

Every user node in Neo4j has **both** labels:

```cypher
(:Member:User {
  id: "uuid-string",
  email: "user@example.com",
  password: "bcrypt-hashed-password",
  firstName: "John",
  lastName: "Doe",
  createdAt: datetime,
  updatedAt: datetime,
  lastLoginAt: datetime
})
```

**Why?**
- ✅ Backward compatibility (old code still uses `:Member`)
- ✅ Cleaner new code (auth routes use `:User`)
- ✅ Simpler than having separate nodes
- ✅ Migration was "add label" not "recreate nodes"

### Password Management

**Password Hashing:**
```
plaintext password
        ↓
bcrypt hash (10 rounds)
        ↓
concat with PEPPER
        ↓
stored in database
```

**NULL Passwords:**
- New users created via signup: password = actual hash
- Users created by admin or migrated: password = NULL
- Login checks: `if (user.password === null)` → returns 401 with `requiresPasswordSetup: true`

### JWT Tokens

**Access Token (30 minutes)**
```
{
  "userId": "user-id-here",
  "email": "user@example.com",
  "type": "access",
  "iat": 1234567890,
  "exp": 1234569690  // 30 min from now
}
```

**Refresh Token (7 days)**
```
{
  "userId": "user-id-here",
  "type": "refresh",
  "iat": 1234567890,
  "exp": 1235000000  // 7 days from now
}
```

### Secrets Management

Secrets are **loaded from AWS Secrets Manager**, not stored as environment variables:

```typescript
// Automatic secret selection based on Lambda function name
const functionName = context.functionName
const secretName = functionName.includes('dev')
  ? 'dev-fl-auth-service-secrets'
  : 'fl-auth-service-secrets'

// Loaded on first request, cached for reuse
const jwt_secret = await getSecret('JWT_SECRET')
const neo4j_uri = await getSecret('NEO4J_URI')
```

## Error Handling

### Error Response Format

All errors follow consistent format:

```json
{
  "error": "User not found",
  "statusCode": 404,
  "requestId": "req-12345-abc",
  "requiresPasswordSetup": false  // (optional)
}
```

### Error Flow

```
Exception thrown in handler
        ↓
Express error middleware catches it
        ↓
Create ApiError (status, message, optional data)
        ↓
Format consistent JSON response
        ↓
Send to client
        ↓
Log to CloudWatch with request ID
```

## Middleware Pipeline

Requests flow through middleware in order:

```
1. CORS Handling
   └─ Set CORS headers

2. Body Parser
   └─ Parse JSON, validate with Zod

3. Request Logger
   └─ Generate request ID, log entry

4. Route Handler
   └─ Execute business logic

5. Error Handler
   └─ Catch and format errors
```

## Database Schema

### Neo4j Constraints & Indexes

```cypher
// Unique email constraint
CREATE CONSTRAINT user_email_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.email IS UNIQUE

// Indexes for fast lookup
CREATE INDEX user_id IF NOT EXISTS
FOR (u:User) ON (u.id)

CREATE INDEX user_email IF NOT EXISTS
FOR (u:User) ON (u.email)

CREATE INDEX member_id IF NOT EXISTS
FOR (m:Member) ON (m.id)
```

### Query Patterns

**Find user by email:**
```cypher
MATCH (u:User {email: $email})
RETURN u
```

**Update password:**
```cypher
MATCH (u:User {id: $userId})
SET u.password = $hashedPassword, u.updatedAt = datetime()
RETURN u
```

**Delete account:**
```cypher
MATCH (u:User {id: $userId})
DETACH DELETE u
```

## Security Architecture

### Authentication Flow

```
User submits password
        ↓
Server receives request (HTTPS only)
        ↓
Validate input (Zod schema)
        ↓
Query database for user
        ↓
bcrypt compare password
        ↓
Generate JWT tokens
        ↓
Return tokens (client stores in secure storage)
        ↓
Client sends access token on each request
        ↓
Server verifies token signature
        ↓
Token expired? → Use refresh token to get new one
```

### Security Features

✅ **Password Security:**
- bcrypt hashing (not reversible)
- Pepper added (additional salt)
- 10 salt rounds (slow to crack)
- NULL password for new users (forces setup before login)

✅ **Token Security:**
- JWT signed with secret
- 30-min access token (expiration)
- 7-day refresh token (longer expiration)
- Signature verified on each request

✅ **Input Validation:**
- All inputs validated with Zod
- Email format checked
- Password strength enforced
- Request size limits

✅ **Secrets Security:**
- All secrets in AWS Secrets Manager (not environment variables)
- Never logged or exposed in errors
- Rotatable without code changes
- IAM-protected access

## Scaling Considerations

### Connection Pooling

```typescript
// Neo4j driver configuration
{
  maxConnectionPoolSize: 50,        // Max 50 concurrent connections
  connectionAcquisitionTimeout: 10000, // Wait 10s for connection
}
```

### Lambda Concurrency

- **Concurrent Executions**: Auto-scales with traffic
- **Connection Pool**: Shared across all Lambda instances
- **Cold Starts**: ~1-2 seconds (loading secrets + DB connect)
- **Warm Starts**: ~100-300ms (reusing container)

### Performance

- Average request: 100-200ms
- Peak latency: 500-1000ms (cold start)
- Database queries: 20-50ms typically
- Email sending: Async (doesn't block response)

## Monitoring

### Key Metrics

- **Error Rate**: Track 401/400/500 errors
- **Request Latency**: Average response time
- **Database Connections**: Active Neo4j connections
- **Token Errors**: Invalid/expired token count
- **Email Failures**: Failed email sends (logged but non-blocking)

### Logs to Watch

```bash
# Production logs
aws logs tail /aws/lambda/fl-auth-service-lambda --follow

# Watch for these messages:
# ✅ Successfully loaded secrets
# ✅ Successfully connected to Neo4j
# ❌ Failed to load secrets
# ❌ Failed to connect to Neo4j
# ❌ Database query failed
```

## Deployment

See [Deployment Guide](../setup/DEPLOYMENT.md) for details.

**Summary:**
- Code pushed to `main` → deploys to production Lambda
- Code pushed to `dev` → deploys to dev Lambda
- GitHub Actions handles build, test, deploy
- Secrets automatically loaded from Secrets Manager

## Next Steps

1. [API Endpoints](../api/ENDPOINTS.md) - Understand each endpoint
2. [Getting Started](../setup/GETTING_STARTED.md) - Local development
3. [Deployment Guide](../setup/DEPLOYMENT.md) - Deploy to AWS
4. [Notifications](./NOTIFICATIONS.md) - Email integration

---

**See Also:**
- [Express.js Implementation Details](./EXPRESS_IMPLEMENTATION.md)
- [Neo4j Query Language](https://neo4j.com/docs/cypher-manual/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
