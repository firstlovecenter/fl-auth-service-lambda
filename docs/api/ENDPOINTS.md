# API Endpoints Reference

Complete API documentation for the FL Auth Service.

## Base URL

- **Production**: `https://your-production-api-gateway-url/auth`
- **Development**: `https://your-development-api-gateway-url/auth`

All endpoints are prefixed with `/auth`.

## Authentication

Most endpoints require a valid JWT access token in the request body or header.

**Token Types:**
- **Access Token**: 30-minute lifetime, used for authentication
- **Refresh Token**: 7-day lifetime, used to obtain new access tokens

## Standard Responses

### Success Response (2xx)

```json
{
  "message": "Operation successful",
  "statusCode": 200,
  "requestId": "unique-request-id-for-tracing",
  "data": { ... }
}
```

### Error Response (4xx/5xx)

```json
{
  "error": "Human-readable error message",
  "statusCode": 400,
  "requestId": "unique-request-id-for-tracing",
  "additionalField": "optional context"
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| `200` | OK | Request successful |
| `201` | Created | Resource created (signup) |
| `400` | Bad Request | Invalid input data |
| `401` | Unauthorized | Invalid credentials, expired token, or password not set |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource already exists (email taken) |
| `500` | Server Error | Internal error |

---

## Endpoints

### 1. User Signup

Create a new user account.

**Endpoint:** `POST /auth/signup`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Validation Rules:**
- `email`: Valid email format, unique (not already registered)
- `password`: Minimum 8 characters
- `firstName`: Required, string
- `lastName`: Optional, string

**Success Response (201):**
```json
{
  "message": "Signup successful",
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

**Error Responses:**

- `400 Bad Request`: Missing or invalid fields
  ```json
  { "error": "Invalid email address", "statusCode": 400 }
  ```

- `409 Conflict`: Email already registered
  ```json
  { "error": "Email already registered", "statusCode": 409 }
  ```

**Side Effects:**
- Creates `Member:User` node in Neo4j
- Updates `createdAt` timestamp
- Sends welcome email (async)

---

### 2. User Login

Authenticate user and obtain tokens.

**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Success Response (200):**
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "firstName": "John"
  }
}
```

**Error Responses:**

- `400 Bad Request`: Missing fields
  ```json
  { "error": "Email is required", "statusCode": 400 }
  ```

- `401 Unauthorized`: Invalid credentials
  ```json
  { "error": "Invalid email or password", "statusCode": 401 }
  ```

- `401 Unauthorized`: Password not set (migrated user)
  ```json
  {
    "error": "Password not set. Please use 'Forgot Password' to set up your password.",
    "statusCode": 401,
    "requiresPasswordSetup": true
  }
  ```

**Side Effects:**
- Updates `lastLoginAt` timestamp
- Returns tokens valid for future requests

---

### 3. Token Verification

Verify that an access token is still valid.

**Endpoint:** `POST /auth/verify`

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200):**
```json
{
  "message": "Token is valid",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "firstName": "John"
  },
  "expiresAt": 1234567890
}
```

**Error Responses:**

- `401 Unauthorized`: Invalid or expired token
  ```json
  { "error": "Invalid or expired token", "statusCode": 401 }
  ```

---

### 4. Refresh Access Token

Obtain a new access token using refresh token.

**Endpoint:** `POST /auth/refresh-token`

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200):**
```json
{
  "message": "Token refreshed",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**

- `401 Unauthorized`: Invalid or expired refresh token
  ```json
  { "error": "Invalid or expired refresh token", "statusCode": 401 }
  ```

---

### 5. Setup Password (First Time)

Set password for users who haven't set one yet (migrated users).

**Endpoint:** `POST /auth/setup-password`

**Request:**
```json
{
  "email": "user@example.com",
  "token": "setup-token-received",
  "password": "NewSecurePass123!"
}
```

**Validation:**
- `email`: Must match registered email
- `password`: Minimum 8 characters

**Success Response (200):**
```json
{
  "message": "Password set successfully"
}
```

**Error Responses:**

- `400 Bad Request`: Missing fields
  ```json
  { "error": "Email is required", "statusCode": 400 }
  ```

- `404 Not Found`: User not found or password already set
  ```json
  { "error": "User not found or password already set", "statusCode": 404 }
  ```

**Side Effects:**
- Updates `password` field (was NULL)
- Updates `updatedAt` timestamp
- Sends password setup confirmation email

---

### 6. Reset Password

Change an existing password (requires current password verification).

**Endpoint:** `POST /auth/reset-password`

**Request:**
```json
{
  "email": "user@example.com",
  "currentPassword": "CurrentPass123!",
  "newPassword": "NewSecurePass123!"
}
```

**Validation:**
- `email`: Must match registered email
- `currentPassword`: Must be correct
- `newPassword`: Minimum 8 characters, must differ from current

**Success Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

**Error Responses:**

- `401 Unauthorized`: Wrong current password
  ```json
  { "error": "Current password is incorrect", "statusCode": 401 }
  ```

- `404 Not Found`: User not found
  ```json
  { "error": "User not found", "statusCode": 404 }
  ```

**Side Effects:**
- Updates `password` field
- Updates `updatedAt` timestamp
- Sends password reset confirmation email
- Doesn't invalidate existing tokens

---

### 7. Delete Account

Permanently delete a user account (requires password verification).

**Endpoint:** `DELETE /auth/account`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "CurrentPass123!"
}
```

**Success Response (200):**
```json
{
  "message": "Account deleted successfully"
}
```

**Error Responses:**

- `401 Unauthorized`: Wrong password
  ```json
  { "error": "Password is incorrect", "statusCode": 401 }
  ```

- `404 Not Found`: User not found
  ```json
  { "error": "User not found", "statusCode": 404 }
  ```

**Side Effects:**
- Permanently deletes user node from database
- Sends account deletion confirmation email
- Invalidates all tokens
- **Irreversible** - data cannot be recovered

---

## Example Requests

### Using cURL

**Signup:**
```bash
curl -X POST https://api-url/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "firstName": "John"
  }'
```

**Login:**
```bash
curl -X POST https://api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

**Verify Token:**
```bash
curl -X POST https://api-url/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

### Using JavaScript Fetch

```javascript
// Signup
const response = await fetch('https://api-url/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!',
    firstName: 'John'
  })
})

const data = await response.json()
console.log(data.accessToken)  // Store this
console.log(data.refreshToken)  // Store this (secure)
```

---

## Token Management

### Access Token Lifetime

- **Expires in**: 30 minutes
- **Use for**: Authenticating API requests
- **Refresh with**: Refresh token

### Refresh Token Lifetime

- **Expires in**: 7 days
- **Use for**: Getting new access tokens
- **Cannot refresh**: Refresh tokens (expired ones can't be renewed)

### Token Storage (Client-Side)

**Secure practices:**

```javascript
// ✅ Access token: Can be in localStorage or sessionStorage
localStorage.setItem('accessToken', data.accessToken)

// ✅ Refresh token: Should be in httpOnly cookie (most secure)
// Server sets via Set-Cookie header
// httpOnly: true  // Can't be accessed by JavaScript

// Or in secure sessionStorage if localStorage not available
sessionStorage.setItem('refreshToken', data.refreshToken)
```

### Using Tokens in Requests

**In JSON body:**
```json
{
  "token": "access-token-here",
  "data": { ... }
}
```

**In Authorization header:**
```
Authorization: Bearer access-token-here
```

---

## Error Handling

### Common Errors

**401 Unauthorized (Invalid Token):**
- Token signature invalid
- Token expired
- Token format incorrect

**Handling in client:**
```javascript
try {
  const response = await api.call()
} catch (error) {
  if (error.status === 401) {
    // Try to refresh token
    const newToken = await refreshAccessToken(refreshToken)
    // Retry request with new token
  }
}
```

**409 Conflict (Email Exists):**
- User tries to signup with registered email
- Should check email availability first

**Handling in client:**
```javascript
if (error.status === 409) {
  alert('Email already registered. Try logging in instead.')
}
```

---

## Rate Limiting

No explicit rate limiting is configured, but AWS Lambda has:
- **Default concurrency**: 1,000 concurrent executions
- **Default throttling**: Returns 429 if exceeded

For production, consider adding rate limiting middleware.

---

## CORS

CORS is enabled for:
- **Origin**: `*` (all origins)
- **Methods**: GET, POST, PUT, DELETE
- **Headers**: Content-Type, Authorization

---

## Next Steps

1. [Getting Started](../setup/GETTING_STARTED.md) - Local development
2. [Architecture Overview](../architecture/OVERVIEW.md) - System design
3. [Deployment Guide](../setup/DEPLOYMENT.md) - Deploy to AWS

---

**See Also:**
- [JWT.io](https://jwt.io/) - Token format
- [HTTP Status Codes](https://httpwg.org/specs/rfc7231.html#status.codes)
