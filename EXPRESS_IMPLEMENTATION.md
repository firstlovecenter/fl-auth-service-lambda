# Express.js Lambda Implementation Guide

## 🎯 Overview

Your authentication Lambda has been refactored from individual handler functions to a production-ready Express.js application with comprehensive middleware, error handling, and support for 10k+ concurrent users.

**Key Benefits:**
- ✅ Single Lambda function handles all auth routes
- ✅ Centralized error handling & logging
- ✅ Request ID tracking for debugging
- ✅ Proper CORS support
- ✅ Scalable middleware architecture
- ✅ Type-safe with full TypeScript support

---

## 📁 New Project Structure

```
src/
├── index.ts                    # Lambda entry point (exports handler)
├── app.ts                      # Express app setup with all routes
├── middleware/
│   ├── errorHandler.ts         # Global error handling & ApiError class
│   ├── requestLogger.ts        # Request logging & ID tracking
│   ├── bodyParser.ts           # JSON body parsing & validation
│   └── cors.ts                 # CORS headers middleware
├── routes/                     # Route handlers (all exported as Express handlers)
│   ├── signup.ts
│   ├── login.ts
│   ├── verify.ts
│   ├── refreshToken.ts
│   ├── setupPassword.ts
│   ├── resetPassword.ts        # NEW - Change existing password
│   └── deleteAccount.ts        # NEW - Permanently delete account
├── handlers/                   # Original Lambda handlers (kept for reference)
├── db/
│   └── neo4j.ts               # Database connection
├── utils/
│   ├── auth.ts                # JWT & password utilities
│   ├── response.ts            # Response helpers
│   └── validation.ts          # Input parsing
└── types/
    └── index.ts               # TypeScript interfaces

dist/                          # Compiled JavaScript output (created by npm run build)
```

---

## 🚀 Authentication Routes

All routes are under `/auth` prefix:

### 1. **POST `/auth/signup`**
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response (201 Created):**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

---

### 2. **POST `/auth/login`**
Authenticate user and receive tokens.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  },
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "roles": ["leaderBacenta", "adminStream"]
  }
}
```

**Special Case (202 Accepted):**
If user exists but password not yet set (legacy migration):
```json
{
  "message": "Password setup required",
  "setupRequired": true
}
```

---

### 3. **POST `/auth/setup-password`**
Complete password setup for migrated users.

**Request:**
```json
{
  "setup_token": "jwt-token-from-email",
  "new_password": "NewSecurePass123",
  "confirm_password": "NewSecurePass123"
}
```

**Response (200 OK):**
```json
{
  "message": "Setup complete - welcome!",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": { ... }
}
```

---

### 4. **POST `/auth/verify`**
Verify JWT token and fetch user data.

**Request:**
```json
{
  "token": "eyJhbGc..."
}
```

**Response (200 OK):**
```json
{
  "valid": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

---

### 5. **POST `/auth/refresh-token`**
Get new access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response (200 OK):**
```json
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGc..."
}
```

---

### 6. **POST `/auth/reset-password`** (NEW)
Allow users to change their password.

**Request:**
```json
{
  "email": "user@example.com",
  "currentPassword": "OldPass123",
  "newPassword": "NewSecurePass456",
  "confirmPassword": "NewSecurePass456"
}
```

**Response (200 OK):**
```json
{
  "message": "Password updated successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

---

### 7. **DELETE `/auth/delete-account`** (NEW)
Permanently delete user account.

**Request:**
```json
{
  "token": "eyJhbGc...",
  "confirmDeletion": true
}
```

**Response (200 OK):**
```json
{
  "message": "Account deleted successfully",
  "accountId": "uuid"
}
```

---

## 🔧 Production Features

### Error Handling
Centralized error handling with proper HTTP status codes:
- `400` - Validation errors, bad requests
- `401` - Invalid/expired tokens, auth failures
- `404` - User/resource not found
- `500` - Server errors

All errors return consistent JSON format:
```json
{
  "error": "Error message",
  "details": [ ... ]  // Optional validation details
}
```

### Request Logging
Every request is logged with:
- Request ID (UUID, traceable in CloudWatch)
- HTTP method & path
- Response status code
- Response time (ms)

Example CloudWatch log:
```json
{
  "timestamp": "2024-02-02T12:00:00.000Z",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "POST",
  "path": "/auth/login",
  "statusCode": 200,
  "duration": "145ms"
}
```

### Request ID Tracking
- Automatically generated UUID for each request
- Passed through `X-Request-ID` header
- Returned in error responses for debugging
- Essential for 10k+ user scale

### CORS Support
- Allows requests from any origin (`*`)
- Supports credentials
- Handles preflight (OPTIONS) requests
- Headers: `Origin`, `Authorization`, etc.

### Database Connection
- Neo4j session pooling (handled by driver)
- Automatic cleanup in `finally` blocks
- Transaction support for atomic operations (setupPassword, deleteAccount)

---

## 📦 Building & Deployment

### Local Build
```bash
npm run build
```

This compiles TypeScript to `dist/` directory.

### Testing Locally
```bash
npm install -g serverless
serverless offline start
```

This starts a local Lambda emulator at `http://localhost:3000`

### Deployment via GitHub Actions
The existing workflow in `.github/workflows/deploy.yml` is configured to:
1. Build TypeScript → `npm run build`
2. Create deployment package (zip with `dist/` + node_modules)
3. Update Lambda function code
4. Set environment variables
5. Verify deployment

**Required GitHub Secrets:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`
- `JWT_SECRET`
- `PEPPER`

---

## 🔐 Security Features

### Password Security
- **Pepper:** Additional salt from `PEPPER` env var (stored separately from password)
- **Cost Factor:** Bcrypt cost 12 (optimized for 10k users)
- **Hashing:** All passwords hashed before storage

### Token Security
- **Access Token:** 30-minute expiration
- **Refresh Token:** 7-day expiration
- **Verification:** JWT signature verified on every request
- **Custom Claims:** Roles embedded in JWT

### Input Validation
- **Zod Schema Validation:** Strict schema parsing
- **Email Format:** RFC 5322 compliant
- **Password Strength:** 8-10 characters minimum
- **Error Messages:** Generic to prevent enumeration

### Database Security
- **Parameterized Queries:** Prevents SQL/Cypher injection
- **Transaction Support:** Atomic operations (no partial updates)
- **User Isolation:** Each user can only access their own data

---

## 📊 Scalability for 10k+ Users

### Design Decisions

**1. Stateless:** No server-side session storage
- Each request is independent
- Lambda cold starts acceptable (stateless)
- Scales horizontally automatically

**2. Request ID Tracking:**
- Every request has unique ID
- Enables distributed tracing
- CloudWatch Insights queries simplified

**3. Middleware Chain:**
- Request → CORS → Body Parser → Logging → Route → Error Handler
- Non-blocking async operations
- Proper error propagation

**4. Database Optimization:**
- Connection pooling via Neo4j driver
- Batch queries where possible
- Transaction support for consistency

**5. Token-Based Auth:**
- No database lookups for token verification (only during refresh)
- JWT claims include roles (no N+1 queries)
- Stateless validation

### Performance Considerations
- **Cold Starts:** Minimal dependencies (Express only ~100kb)
- **Memory:** 256-512MB sufficient for typical loads
- **Timeout:** 30s recommended (async operations complete quickly)
- **Concurrency:** Lambda auto-scales to handle 10k users

---

## 🧪 Testing

### Unit Tests
Create test files in `src/__tests__/`:
```typescript
import { signup } from '../routes/signup'

describe('signup', () => {
  it('should create a new user', async () => {
    // Test implementation
  })
})
```

Run tests:
```bash
npm test
```

### Integration Tests
Test the full Express app:
```typescript
import app from '../app'

describe('POST /auth/signup', () => {
  it('should return 201 on success', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'test@example.com', password: 'Test1234' })
    
    expect(res.status).toBe(201)
  })
})
```

---

## 🐛 Debugging

### CloudWatch Logs
View logs for specific request:
```bash
aws logs tail /aws/lambda/auth-lambda --follow --grep "REQUEST-ID"
```

### Local Development
```bash
# Enable debug logging
DEBUG=express:* npm run start

# Or with serverless offline
serverless offline start --stage dev
```

### Error Messages
- Validation errors include field names
- JWT errors indicate expired token
- Database errors logged with full context
- Request ID always included in response

---

## 📝 Migration from Lambda Handlers

**Old Pattern:**
```typescript
export const handler = async (event) => {
  return { statusCode: 200, body: JSON.stringify({...}) }
}
```

**New Pattern:**
```typescript
export const signup = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({...})
})
```

**Benefits:**
- Better error handling (automatic try/catch)
- Cleaner route definitions
- Middleware support
- Type safety with Express/Node types

---

## 🔄 Next Steps

1. **Deploy:** Use GitHub Actions (`git push origin main`)
2. **Monitor:** Check CloudWatch Logs & Lambda Metrics
3. **Test:** Verify all endpoints with curl/Postman
4. **Scale:** Adjust Lambda memory/timeout as needed
5. **Document:** Add API documentation (consider Swagger)

---

## 📚 Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [Zod Schema Validation](https://zod.dev/)
- [Neo4j Driver](https://neo4j.com/docs/driver-manual/current/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [JWT.io](https://jwt.io/) - Token debugging
