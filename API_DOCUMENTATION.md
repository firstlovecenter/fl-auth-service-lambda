# FL Auth Service API Documentation

Complete API reference for the First Love Center Authentication Service.

## Base URL

**Production**: `https://your-production-api-gateway-url`  
**Development**: `https://your-development-api-gateway-url`

All endpoints use the `/auth` prefix.

## Authentication

Most endpoints require a valid JWT token sent in the request body. Tokens are obtained through the login endpoint.

### Token Types

- **Access Token**: Short-lived (30 minutes), used for authentication
- **Refresh Token**: Long-lived (7 days), used to obtain new access tokens

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Error message description",
  "statusCode": 400,
  "requestId": "unique-request-id"
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| `200` | Success | Request completed successfully |
| `201` | Created | Resource created (signup) |
| `400` | Bad Request | Invalid input data |
| `401` | Unauthorized | Invalid credentials or token |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource already exists |
| `500` | Server Error | Internal server error |

---

## Endpoints

### 1. User Signup

Create a new user account.

**Endpoint**: `POST /auth/signup`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",          // Optional
  "lastName": "Doe"              // Optional
}
```

**Validation Rules**:
- `email`: Must be valid email format
- `password`: Minimum 8 characters
- `firstName`: Optional string
- `lastName`: Optional string

**Success Response** (201):
```json
{
  "message": "User created successfully",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  }
}
```

**Error Responses**:

- `400 Bad Request`: Invalid email or password too short
```json
{
  "error": "Invalid email address",
  "statusCode": 400,
  "requestId": "abc-123"
}
```

- `409 Conflict`: Email already exists
```json
{
  "error": "A user with this email already exists",
  "statusCode": 409,
  "requestId": "abc-123"
}
```

**Side Effects**:
- Sends welcome email to user
- Creates Member node in Neo4j database

**Example cURL**:
```bash
curl -X POST https://api-url/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

---

### 2. User Login

Authenticate a user and receive JWT tokens.

**Endpoint**: `POST /auth/login`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Validation Rules**:
- `email`: Must be valid email format
- `password`: Required, minimum 1 character

**Success Response** (200):
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Token Details**:
- `accessToken`: Expires in 30 minutes
- `refreshToken`: Expires in 7 days

**Error Responses**:

- `400 Bad Request`: Missing or invalid fields
```json
{
  "error": "Invalid email address",
  "statusCode": 400,
  "requestId": "abc-123"
}
```

- `401 Unauthorized`: Invalid credentials
```json
{
  "error": "Invalid email or password",
  "statusCode": 401,
  "requestId": "abc-123"
}
```

**Side Effects**:
- Updates `lastLoginAt` timestamp in database

**Example cURL**:
```bash
curl -X POST https://api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

---

### 3. Verify Token

Verify the validity of an access token.

**Endpoint**: `POST /auth/verify`

**Request Body**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Validation Rules**:
- `token`: Required, must be valid JWT format

**Success Response** (200):
```json
{
  "message": "Token is valid",
  "user": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  }
}
```

**Error Responses**:

- `400 Bad Request`: Token missing
```json
{
  "error": "Token is required",
  "statusCode": 400,
  "requestId": "abc-123"
}
```

- `401 Unauthorized`: Invalid or expired token
```json
{
  "error": "Invalid or expired token",
  "statusCode": 401,
  "requestId": "abc-123"
}
```

**Example cURL**:
```bash
curl -X POST https://api-url/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

### 4. Refresh Token

Obtain a new access token using a refresh token.

**Endpoint**: `POST /auth/refresh-token`

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Validation Rules**:
- `refreshToken`: Required, must be valid JWT format

**Success Response** (200):
```json
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Notes**:
- Returns both new access token and new refresh token
- Old refresh token is invalidated
- New refresh token expires in 7 days from now

**Error Responses**:

- `400 Bad Request`: Refresh token missing
```json
{
  "error": "Refresh token is required",
  "statusCode": 400,
  "requestId": "abc-123"
}
```

- `401 Unauthorized`: Invalid or expired refresh token
```json
{
  "error": "Invalid or expired refresh token",
  "statusCode": 401,
  "requestId": "abc-123"
}
```

**Example cURL**:
```bash
curl -X POST https://api-url/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

### 5. Setup Password

Set password for migrated users or first-time password setup.

**Endpoint**: `POST /auth/setup-password`

**Request Body**:
```json
{
  "email": "user@example.com",
  "token": "setup-token-from-migration",
  "password": "NewSecurePass123!"
}
```

**Validation Rules**:
- `email`: Must be valid email format
- `token`: Required setup token
- `password`: Minimum 8 characters

**Success Response** (200):
```json
{
  "message": "Password set up successfully. You can now log in.",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  }
}
```

**Error Responses**:

- `400 Bad Request`: Invalid input
```json
{
  "error": "Password must be at least 8 characters",
  "statusCode": 400,
  "requestId": "abc-123"
}
```

- `401 Unauthorized`: Invalid or expired setup token
```json
{
  "error": "Invalid or expired setup token",
  "statusCode": 401,
  "requestId": "abc-123"
}
```

- `404 Not Found`: User not found
```json
{
  "error": "User not found",
  "statusCode": 404,
  "requestId": "abc-123"
}
```

**Use Case**:
Used when migrating users from old system where they don't have a password yet. Setup token is sent via email.

**Example cURL**:
```bash
curl -X POST https://api-url/auth/setup-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "token": "setup-token-xyz",
    "password": "NewSecurePass123!"
  }'
```

---

### 6. Reset Password

Change password for an existing user (requires current password).

**Endpoint**: `POST /auth/reset-password`

**Request Body**:
```json
{
  "email": "user@example.com",
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

**Validation Rules**:
- `email`: Must be valid email format
- `currentPassword`: Required
- `newPassword`: Minimum 8 characters
- `confirmPassword`: Must match `newPassword`
- New password must be different from current password

**Success Response** (200):
```json
{
  "message": "Password updated successfully",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  }
}
```

**Error Responses**:

- `400 Bad Request`: Passwords don't match
```json
{
  "error": "New passwords do not match",
  "statusCode": 400,
  "requestId": "abc-123"
}
```

- `400 Bad Request`: Same password
```json
{
  "error": "New password must be different from current password",
  "statusCode": 400,
  "requestId": "abc-123"
}
```

- `401 Unauthorized`: Wrong current password
```json
{
  "error": "Invalid email or password",
  "statusCode": 401,
  "requestId": "abc-123"
}
```

**Side Effects**:
- Sends password reset confirmation email
- Updates `updatedAt` timestamp

**Example cURL**:
```bash
curl -X POST https://api-url/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "currentPassword": "OldPassword123!",
    "newPassword": "NewPassword123!",
    "confirmPassword": "NewPassword123!"
  }'
```

---

### 7. Delete Account

Permanently delete a user account (requires valid access token).

**Endpoint**: `DELETE /auth/delete-account`

**Request Body**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "confirmDeletion": true
}
```

**Validation Rules**:
- `token`: Required, must be valid access token
- `confirmDeletion`: Must be `true` (explicit confirmation)

**Success Response** (200):
```json
{
  "message": "Account deleted successfully",
  "accountId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses**:

- `400 Bad Request`: Missing confirmation
```json
{
  "error": "You must confirm account deletion",
  "statusCode": 400,
  "requestId": "abc-123"
}
```

- `401 Unauthorized`: Invalid token
```json
{
  "error": "Invalid or expired token",
  "statusCode": 401,
  "requestId": "abc-123"
}
```

**Side Effects**:
- Permanently deletes all user data (cascade delete)
- Sends account deletion confirmation email
- Operation is atomic (uses transaction)

**Warning**: This action is irreversible!

**Example cURL**:
```bash
curl -X DELETE https://api-url/auth/delete-account \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "confirmDeletion": true
  }'
```

---

## Rate Limiting

Currently, rate limiting is handled at the API Gateway level. Default limits:
- **Burst**: 5000 requests
- **Rate**: 10000 requests per second

Contact infrastructure team to adjust limits for your use case.

## CORS

The API supports CORS with the following configuration:
- **Allowed Origins**: `*` (configurable)
- **Allowed Methods**: `GET, POST, DELETE, OPTIONS`
- **Allowed Headers**: `Content-Type, Authorization`

## Request IDs

Every request receives a unique request ID for tracking and debugging. This ID is:
- Generated by the request logger middleware
- Included in error responses
- Logged to CloudWatch

Use request IDs when reporting issues or debugging.

## Best Practices

### Security
1. **Never log tokens**: Don't log access/refresh tokens in production
2. **Use HTTPS only**: Never send credentials over HTTP
3. **Store tokens securely**: Use secure storage (not localStorage)
4. **Refresh tokens proactively**: Refresh before expiration

### Error Handling
1. **Check status codes**: Always check HTTP status code
2. **Parse error messages**: Display user-friendly messages
3. **Use request IDs**: Include request ID when reporting errors
4. **Implement retries**: Retry on 5xx errors with exponential backoff

### Performance
1. **Reuse tokens**: Don't login on every request
2. **Cache user data**: Cache user info from login response
3. **Use refresh tokens**: Avoid repeated logins
4. **Monitor latency**: Track P95/P99 latencies

## Code Examples

### JavaScript/TypeScript

```typescript
// Signup
async function signup(email: string, password: string) {
  const response = await fetch('https://api-url/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error)
  }
  
  return await response.json()
}

// Login
async function login(email: string, password: string) {
  const response = await fetch('https://api-url/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error)
  }
  
  const data = await response.json()
  // Store tokens securely
  localStorage.setItem('accessToken', data.accessToken)
  localStorage.setItem('refreshToken', data.refreshToken)
  
  return data
}

// Verify Token
async function verifyToken(token: string) {
  const response = await fetch('https://api-url/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  })
  
  return response.ok
}

// Refresh Token
async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken')
  
  const response = await fetch('https://api-url/auth/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  })
  
  if (!response.ok) {
    // Refresh token expired, need to login again
    throw new Error('Session expired')
  }
  
  const data = await response.json()
  localStorage.setItem('accessToken', data.accessToken)
  localStorage.setItem('refreshToken', data.refreshToken)
  
  return data
}
```

### Python

```python
import requests

BASE_URL = "https://api-url/auth"

def signup(email: str, password: str, first_name: str = None, last_name: str = None):
    response = requests.post(
        f"{BASE_URL}/signup",
        json={
            "email": email,
            "password": password,
            "firstName": first_name,
            "lastName": last_name
        }
    )
    response.raise_for_status()
    return response.json()

def login(email: str, password: str):
    response = requests.post(
        f"{BASE_URL}/login",
        json={"email": email, "password": password}
    )
    response.raise_for_status()
    return response.json()

def verify_token(token: str):
    response = requests.post(
        f"{BASE_URL}/verify",
        json={"token": token}
    )
    return response.status_code == 200
```

## Postman Collection

Import the following collection into Postman for easy testing:

[Download Postman Collection](#) (Coming soon)

## Support

For API support:
- Check CloudWatch logs with request ID
- Review this documentation
- Contact development team

## Changelog

### v1.3.0 (Current)
- Added environment-based notification routing
- Updated environment detection to use Secrets Manager

### v1.2.0
- Added email notification integration
- Added password reset endpoint
- Added account deletion endpoint

### v1.1.0
- Migrated to AWS Secrets Manager
- All auth functions now async

### v1.0.0
- Initial Express.js implementation
- 7 authentication endpoints
- Production-ready middleware
