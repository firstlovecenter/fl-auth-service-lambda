    # Authentication Service API Documentation

    Version: 1.0  
    Last Updated: February 6, 2026

    ## Overview

    This is a production-ready authentication service built on AWS Lambda with Neo4j database. It provides complete user authentication, password management, and token-based authorization.

    ## Base URL

    ```
    Production: https://<your-api-gateway-id>.execute-api.eu-west-2.amazonaws.com/
    Development: http://localhost:3000/
    ```

    All endpoints are prefixed with `/auth`.

    ## Quick Start
    a
    1. **Sign up a new user** → `POST /auth/signup`
    2. **Login** → `POST /auth/login` (returns `accessToken` and `refreshToken`)
    3. **Use the `accessToken`** in subsequent requests
    4. **Refresh tokens** → `POST /auth/refresh` when access token expires

    ## Authentication

    The service uses JWT (JSON Web Tokens) for authentication:

    - **Access Token**: 30-minute lifetime, used for API authentication
    - **Refresh Token**: 7-day lifetime, used to obtain new access tokens

    Include tokens in your request body for authenticated endpoints.

    ## Response Format

    ### Success Response (2xx)

    ```json
    {
    "message": "Operation successful",
    "statusCode": 200,
    "data": { ... }
    }
    ```

    ### Error Response (4xx/5xx)

    ```json
    {
    "error": "Human-readable error message",
    "statusCode": 400,
    "requestId": "unique-request-id-for-tracing"
    }
    ```

    ### HTTP Status Codes

    | Code | Meaning | Usage |
    |------|---------|-------|
    | `200` | OK | Request successful |
    | `201` | Created | User account created |
    | `400` | Bad Request | Invalid input data or validation error |
    | `401` | Unauthorized | Invalid credentials, expired token, or password not set |
    | `404` | Not Found | User/resource doesn't exist |
    | `409` | Conflict | Email or WhatsApp already registered |
    | `500` | Server Error | Internal server error |

    ---

    ## API Endpoints

    ### 1. User Signup

    Create a new user account and receive authentication tokens.

    **Endpoint:** `POST /auth/signup`

    **Request Body:**
    ```json
    {
    "email": "user@example.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe",
    "whatsappNumber": "+233123456789"
    }
    ```

    **Fields:**
    - `email` (required): Valid email address, must be unique
    - `password` (required): Minimum 8 characters
    - `firstName` (required): User's first name
    - `lastName` (required): User's last name  
    - `whatsappNumber` (optional): WhatsApp number, must be unique if provided

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

    - **409 Conflict** - Email already registered:
    ```json
    {
        "error": "There is already an account with this email \"user@example.com\" for John Doe",
        "statusCode": 409
    }
    ```

    - **409 Conflict** - WhatsApp number already registered:
    ```json
    {
        "error": "There is already a member with this WhatsApp number \"+233123456789\" for Jane Smith",
        "statusCode": 409
    }
    ```

    - **400 Bad Request** - Invalid input:
    ```json
    {
        "error": "Password must be at least 8 characters",
        "statusCode": 400
    }
    ```

    ---

    ### 2. User Login

    Authenticate with email and password to receive access tokens.

    **Endpoint:** `POST /auth/login`

    **Request Body:**
    ```json
    {
    "email": "user@example.com",
    "password": "SecurePass123!"
    }
    ```

    **Fields:**
    - `email` (required): User's email address
    - `password` (required): User's password

    **Success Response (200):**
    ```json
    {
    "message": "Login successful",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "roles": ["leaderBacenta", "adminStream"]
    }
    }
    ```

    **Roles Included:**

    The response includes role-based access control (RBAC) information. Possible roles:
    - Leadership: `leaderBacenta`, `leaderCampus`, `leaderCouncil`, `leaderStream`, `leaderGovernorship`, `leaderOversight`, `leaderDenomination`
    - Admin: `adminStream`, `adminCampus`, `adminCouncil`, `adminGovernorship`, `adminOversight`, `adminDenomination`
    - Arrivals Admin: `arrivalsAdminStream`, `arrivalsAdminCampus`, `arrivalsAdminCouncil`, `arrivalsAdminGovernorship`
    - Other: `arrivalsCounterStream`, `tellerCouncil`, `tellerStream`, `sheepSeekerStream`

    **Error Responses:**

    - **401 Unauthorized** - Invalid credentials:
    ```json
    {
        "error": "Invalid email or password",
        "statusCode": 401
    }
    ```

    - **401 Unauthorized** - Password not set:
    ```json
    {
        "error": "Password not set. Please use 'Forgot Password' to set up your password.",
        "statusCode": 401,
        "requiresPasswordSetup": true
    }
    ```

    ---

    ### 3. Refresh Access Token

    Obtain a new access token using a valid refresh token.

    **Endpoint:** `POST /auth/refresh`

    **Request Body:**
    ```json
    {
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```

    **Fields:**
    - `refreshToken` (required): Valid refresh token from login/signup

    **Success Response (200):**
    ```json
    {
    "message": "Token refreshed successfully",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```

    **Error Responses:**

    - **401 Unauthorized** - Invalid or expired refresh token:
    ```json
    {
        "error": "Invalid or expired token",
        "statusCode": 401
    }
    ```

    - **404 Not Found** - User not found:
    ```json
    {
        "error": "User not found",
        "statusCode": 404
    }
    ```

    ---

    ### 4. Verify Token

    Validate an access token and retrieve user information.

    **Endpoint:** `POST /auth/verify`

    **Request Body:**
    ```json
    {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```

    **Fields:**
    - `token` (required): Access token to verify

    **Success Response (200):**
    ```json
    {
    "valid": true,
    "user": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe"
    }
    }
    ```

    **Error Responses:**

    - **401 Unauthorized** - Invalid token:
    ```json
    {
        "error": "Invalid or expired token",
        "statusCode": 401
    }
    ```

    - **404 Not Found** - User not found:
    ```json
    {
        "error": "User not found",
        "statusCode": 404
    }
    ```

    ---

    ### 5. Forgot Password

    Request a password reset link. This endpoint is **timing-attack resistant** and does not reveal if an email exists.

    **Endpoint:** `POST /auth/forgot-password`

    **Request Body:**
    ```json
    {
    "email": "user@example.com"
    }
    ```

    **Fields:**
    - `email` (required): User's email address

    **Success Response (200):**
    ```json
    {
    "message": "If an account exists with this email, you will receive a password reset link."
    }
    ```

    **Important:** This endpoint **always returns success** (even if the email doesn't exist) to prevent user enumeration attacks.

    **Rate Limiting:**
    - **Per Email**: 3 requests per hour
    - **Per IP**: 10 requests per hour
    - Blocked requests still return success but no email is sent

    **Security Features:**
    - Constant-time response (200-400ms)
    - No user enumeration
    - Rate limiting with exponential backoff
    - All attempts logged for security audit

    ---

    ### 6. Setup Password

    Set a password for the first time using a setup token (from forgot password flow).

    **Endpoint:** `POST /auth/setup-password`

    **Request Body:**
    ```json
    {
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "password": "NewSecurePass123!"
    }
    ```

    **Fields:**
    - `email` (required): User's email address
    - `token` (required): Setup token from password reset email
    - `password` (required): New password, minimum 8 characters

    **Success Response (200):**
    ```json
    {
    "message": "Password set up successfully",
    "user": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "user@example.com"
    }
    }
    ```

    **Error Responses:**

    - **401 Unauthorized** - Invalid or expired token:
    ```json
    {
        "error": "Invalid or expired setup link. Please try logging in again.",
        "statusCode": 401
    }
    ```

    - **404 Not Found** - User not found or password already set:
    ```json
    {
        "error": "User not found or password already set",
        "statusCode": 404
    }
    ```

    ---

    ### 7. Reset Password

    Change password for an authenticated user (requires current password).

    **Endpoint:** `POST /auth/reset-password`

    **Request Body:**
    ```json
    {
    "email": "user@example.com",
    "currentPassword": "OldPassword123!",
    "newPassword": "NewSecurePass123!",
    "confirmPassword": "NewSecurePass123!"
    }
    ```

    **Fields:**
    - `email` (required): User's email address
    - `currentPassword` (required): Current password
    - `newPassword` (required): New password, minimum 8 characters
    - `confirmPassword` (required): Must match `newPassword`

    **Success Response (200):**
    ```json
    {
    "message": "Password updated successfully",
    "user": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "user@example.com"
    }
    }
    ```

    **Error Responses:**

    - **400 Bad Request** - Passwords don't match:
    ```json
    {
        "error": "New passwords do not match",
        "statusCode": 400
    }
    ```

    - **400 Bad Request** - Same password:
    ```json
    {
        "error": "New password must be different from current password",
        "statusCode": 400
    }
    ```

    - **401 Unauthorized** - Invalid current password:
    ```json
    {
        "error": "Invalid email or password",
        "statusCode": 401
    }
    ```

    ---

    ### 8. Delete Account

    Permanently delete a user account.

    **Endpoint:** `POST /auth/delete-account`

    **Request Body:**
    ```json
    {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "confirmDeletion": true
    }
    ```

    **Fields:**
    - `token` (required): Valid access token
    - `confirmDeletion` (required): Must be `true` to confirm deletion

    **Success Response (200):**
    ```json
    {
    "message": "Account deleted successfully",
    "accountId": "550e8400-e29b-41d4-a716-446655440000"
    }
    ```

    **Error Responses:**

    - **400 Bad Request** - Confirmation not provided:
    ```json
    {
        "error": "Account deletion must be explicitly confirmed",
        "statusCode": 400
    }
    ```

    - **401 Unauthorized** - Invalid token:
    ```json
    {
        "error": "Invalid or expired token",
        "statusCode": 401
    }
    ```

    **Warning:** This operation is **irreversible** and deletes all user data.

    ---

    ## Health Check

    Check if the service is running.

    **Endpoint:** `GET /health`

    **Success Response (200):**
    ```json
    {
    "status": "healthy",
    "timestamp": "2026-02-06T10:30:00.000Z"
    }
    ```

    ---

    ## Integration Examples

    ### JavaScript/TypeScript

    ```typescript
    const API_BASE_URL = 'https://your-api-gateway-url.com/auth';

    // Signup
    async function signup(email: string, password: string, firstName: string, lastName: string) {
    const response = await fetch(`${API_BASE_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, firstName, lastName })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
    }
    
    const data = await response.json();
    // Store tokens
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.user;
    }

    // Login
    async function login(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
    }
    
    const data = await response.json();
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.user;
    }

    // Refresh Token
    async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    
    const response = await fetch(`${API_BASE_URL}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
    });
    
    if (!response.ok) {
        // Refresh token expired, redirect to login
        window.location.href = '/login';
        return;
    }
    
    const data = await response.json();
    localStorage.setItem('accessToken', data.accessToken);
    }

    // Verify Token
    async function verifyToken(token: string) {
    const response = await fetch(`${API_BASE_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    });
    
    return response.ok;
    }
    ```

    ### Python

    ```python
    import requests

    API_BASE_URL = "https://your-api-gateway-url.com/auth"

    def signup(email, password, first_name, last_name):
        response = requests.post(
            f"{API_BASE_URL}/signup",
            json={
                "email": email,
                "password": password,
                "firstName": first_name,
                "lastName": last_name
            }
        )
        response.raise_for_status()
        data = response.json()
        return data["accessToken"], data["refreshToken"], data["user"]

    def login(email, password):
        response = requests.post(
            f"{API_BASE_URL}/login",
            json={"email": email, "password": password}
        )
        response.raise_for_status()
        data = response.json()
        return data["accessToken"], data["refreshToken"], data["user"]

    def refresh_token(refresh_token):
        response = requests.post(
            f"{API_BASE_URL}/refresh",
            json={"refreshToken": refresh_token}
        )
        response.raise_for_status()
        return response.json()["accessToken"]

    def verify_token(token):
        response = requests.post(
            f"{API_BASE_URL}/verify",
            json={"token": token}
        )
        return response.status_code == 200
    ```

    ### cURL

    ```bash
    # Signup
    curl -X POST https://your-api-gateway-url.com/auth/signup \
    -H "Content-Type: application/json" \
    -d '{
        "email": "user@example.com",
        "password": "SecurePass123!",
        "firstName": "John",
        "lastName": "Doe"
    }'

    # Login
    curl -X POST https://your-api-gateway-url.com/auth/login \
    -H "Content-Type: application/json" \
    -d '{
        "email": "user@example.com",
        "password": "SecurePass123!"
    }'

    # Refresh Token
    curl -X POST https://your-api-gateway-url.com/auth/refresh \
    -H "Content-Type: application/json" \
    -d '{
        "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }'

    # Verify Token
    curl -X POST https://your-api-gateway-url.com/auth/verify \
    -H "Content-Type: application/json" \
    -d '{
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }'
    ```

    ---

    ## Security Features

    ### Password Security
    - **Hashing**: bcrypt with configurable rounds
    - **Pepper**: Additional secret pepper for enhanced security
    - **Minimum Length**: 8 characters

    ### Token Security
    - **JWT**: Industry-standard JSON Web Tokens
    - **Short-lived Access Tokens**: 30 minutes
    - **Longer Refresh Tokens**: 7 days
    - **Secure Secret**: Environment-based JWT secret

    ### Rate Limiting
    - **Forgot Password**: 3 requests/hour per email, 10 requests/hour per IP
    - **Protection**: Against brute force and enumeration attacks

    ### Timing Attack Prevention
    - **Constant-time Responses**: Prevents user enumeration
    - **Consistent Delays**: 200-400ms response time regardless of outcome

    ### CORS
    - **Configurable**: Set allowed origins via environment variables
    - **Secure Headers**: Proper CORS configuration for cross-origin requests

    ---

    ## Error Handling

    All endpoints follow a consistent error format:

    ```json
    {
    "error": "Descriptive error message",
    "statusCode": 400,
    "requestId": "abc123-def456-ghi789"
    }
    ```

    **Request IDs** are included in all responses for debugging and tracing.

    ---

    ## Best Practices for Integration

    ### 1. Token Storage
    - **Web**: Store tokens in `httpOnly` cookies or secure localStorage
    - **Mobile**: Use secure storage (Keychain/Keystore)
    - **Never**: Commit tokens to version control

    ### 2. Token Refresh Strategy
    ```typescript
    // Implement automatic token refresh
    async function makeAuthenticatedRequest(url: string, options: RequestInit) {
    let token = localStorage.getItem('accessToken');
    
    let response = await fetch(url, {
        ...options,
        headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
        }
    });
    
    // If token expired, refresh and retry
    if (response.status === 401) {
        await refreshAccessToken();
        token = localStorage.getItem('accessToken');
        response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        }
        });
    }
    
    return response;
    }
    ```

    ### 3. Error Handling
    Always handle errors gracefully and display user-friendly messages:

    ```typescript
    try {
    await login(email, password);
    } catch (error) {
    if (error.message.includes('Invalid email or password')) {
        // Show login error
    } else if (error.message.includes('Password not set')) {
        // Redirect to forgot password
    } else {
        // Show generic error
    }
    }
    ```

    ### 4. Validation
    Validate input on the client-side before sending to reduce unnecessary API calls:

    ```typescript
    function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validatePassword(password: string): boolean {
    return password.length >= 8;
    }
    ```

    ---

    ## Rate Limits

    | Endpoint | Limit |
    |----------|-------|
    | `/forgot-password` | 3/hour per email, 10/hour per IP |
    | All other endpoints | No explicit limit (standard AWS Lambda limits apply) |

    ---

    ## Support

    For issues or questions:
    - **Repository**: Contact repository owner
    - **Email**: support@yourdomain.com
    - **Documentation**: See `/docs` folder in repository

    ---

    ## Changelog

    ### Version 1.0 (February 2026)
    - Initial release
    - User signup, login, verification
    - Token refresh mechanism
    - Password reset flow
    - Account deletion
    - Role-based access control (RBAC)
    - Production-ready security features
