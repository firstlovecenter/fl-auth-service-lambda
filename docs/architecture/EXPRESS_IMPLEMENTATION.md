# Express.js Implementation

How the Lambda uses Express.js for routing and middleware.

## From Handlers to Express

The Lambda was refactored from individual handler functions to a single Express.js application.

### Before (Individual Handlers)

```
lambda/
├── handlers/signup.ts
├── handlers/login.ts
├── handlers/verify.ts
└── ... (separate handler per endpoint)
```

Each handler was invoked directly by API Gateway.

### After (Express Application)

```
src/
├── index.ts          # Single Lambda entry point
├── app.ts            # Express app with all routes
├── routes/
│  ├── signup.ts
│  ├── login.ts
│  ├── verify.ts
│  └── ... (all routes)
└── middleware/       # Shared middleware chain
```

Single Lambda function handles all routes through Express.

## Entry Point (src/index.ts)

```typescript
import { handler } from 'serverless-http'
import { app } from './app'

// Adapter converts Express app to Lambda handler
export const lambdaHandler = handler(app)
```

The `serverless-http` package bridges Express.js and AWS Lambda.

## Express App Setup (src/app.ts)

```typescript
import express from 'express'
import { cors } from './middleware/cors'
import { bodyParser } from './middleware/bodyParser'
import { requestLogger } from './middleware/requestLogger'
import { errorHandler } from './middleware/errorHandler'

const app = express()

// Middleware (executed for every request)
app.use(cors())
app.use(bodyParser())
app.use(requestLogger())

// Routes
app.post('/auth/signup', signup)
app.post('/auth/login', login)
app.post('/auth/verify', verify)
// ... more routes ...

// Error handler (last middleware)
app.use(errorHandler)

export { app }
```

## Middleware Chain

Middleware executes in order for each request:

### 1. CORS (src/middleware/cors.ts)

Handles cross-origin requests:

```typescript
// Sets headers for browser security
res.setHeader('Access-Control-Allow-Origin', '*')
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
```

### 2. Body Parser (src/middleware/bodyParser.ts)

Parses JSON and validates:

```typescript
app.use(express.json())

// Zod validation on request body
app.post('/auth/login', (req, res) => {
  const parsed = loginSchema.parse(req.body) // Throws if invalid
  // Continue with validated data
})
```

### 3. Request Logger (src/middleware/requestLogger.ts)

Generates request ID and logs:

```typescript
const requestId = generateRequestId()
req.id = requestId

console.log(`[${requestId}] ${req.method} ${req.path}`)
// Each log includes requestId for tracing
```

### 4. Route Handler

Business logic in `/auth/*` routes.

### 5. Error Handler (src/middleware/errorHandler.ts)

Catches all errors and formats response:

```typescript
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    // Known error
    return res.status(err.status).json({
      error: err.message,
      statusCode: err.status,
      requestId: req.id,
      ...err.data
    })
  }
  
  // Unknown error
  res.status(500).json({
    error: 'Internal server error',
    statusCode: 500,
    requestId: req.id
  })
})
```

## Error Handling with ApiError

Custom error class for consistent error handling:

```typescript
class ApiError extends Error {
  constructor(status: number, message: string, data?: Record<string, any>) {
    super(message)
    this.status = status
    this.data = data
  }
}

// Usage in handlers
throw new ApiError(401, 'Invalid password', {
  requiresPasswordSetup: true
})
```

Response:
```json
{
  "error": "Invalid password",
  "statusCode": 401,
  "requestId": "req-123",
  "requiresPasswordSetup": true
}
```

## Route Examples

### Route: POST /auth/signup

```typescript
app.post('/auth/signup', async (req, res, next) => {
  try {
    // 1. Validate input
    const { email, password, firstName } = signupSchema.parse(req.body)
    
    // 2. Check if user exists
    const existing = await queryDatabase(...)
    if (existing) {
      throw new ApiError(409, 'User already exists')
    }
    
    // 3. Hash password
    const hashedPassword = await hashPassword(password)
    
    // 4. Create user in database
    const user = await createUserNode({
      email,
      password: hashedPassword,
      firstName
    })
    
    // 5. Generate tokens
    const accessToken = await signJWT({ userId: user.id })
    const refreshToken = await signRefreshToken({ userId: user.id })
    
    // 6. Send email (fire-and-forget, don't await)
    sendWelcomeEmail(email, firstName).catch(err => {
      console.error('Email failed:', err)
    })
    
    // 7. Return response
    res.status(201).json({
      message: 'Signup successful',
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, firstName }
    })
  } catch (error) {
    next(error) // Pass to error handler
  }
})
```

### Route: POST /auth/login

```typescript
app.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body)
    
    // Find user
    const user = await queryDatabase(
      'MATCH (u:User {email: $email}) RETURN u',
      { email }
    )
    
    if (!user) {
      throw new ApiError(401, 'Invalid email or password')
    }
    
    // Check if password is NULL (new users)
    if (user.password === null) {
      throw new ApiError(401, 'Password not set. Use forgot password flow.', {
        requiresPasswordSetup: true
      })
    }
    
    // Verify password
    const isValid = await comparePassword(password, user.password)
    if (!isValid) {
      throw new ApiError(401, 'Invalid email or password')
    }
    
    // Update last login
    await updateUserLastLogin(user.id)
    
    // Generate tokens
    const accessToken = await signJWT({ userId: user.id })
    const refreshToken = await signRefreshToken({ userId: user.id })
    
    res.status(200).json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, firstName: user.firstName }
    })
  } catch (error) {
    next(error)
  }
})
```

## Request/Response Flow

```
1. Client sends HTTP request
   ↓
2. API Gateway routes to Lambda
   ↓
3. serverless-http adapter invokes Express
   ↓
4. Request passes through middleware chain:
   - CORS adds headers
   - Body Parser parses JSON
   - Request Logger adds request ID
   ↓
5. Matching route handler executes
   ├─ Validates input (Zod)
   ├─ Queries database (Neo4j)
   ├─ Performs business logic
   ├─ May throw ApiError
   └─ Sends response
   ↓
6. Error handler (if error occurred)
   └─ Formats error response
   ↓
7. serverless-http converts Express response
   ↓
8. Lambda returns response to API Gateway
   ↓
9. API Gateway returns JSON to client
```

## Testing Routes

Routes are easy to test with Express request/response mocks:

```typescript
import request from 'supertest'
import { app } from '../src/app'

describe('POST /auth/login', () => {
  it('should return 401 for invalid credentials', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'wrong' })
    
    expect(response.status).toBe(401)
    expect(response.body.error).toBe('Invalid email or password')
  })
})
```

## Benefits of Express

✅ **Middleware Reuse**: CORS, logging, validation shared across routes  
✅ **Error Centralization**: Single error handler for all errors  
✅ **Code Organization**: Routes separated into files  
✅ **Testing**: Can test with mocks  
✅ **Scalability**: Easy to add new routes  
✅ **Convention**: Express developers understand code immediately  

## Comparison: Handlers vs Express

| Aspect | Handlers | Express |
|--------|----------|---------|
| **File Organization** | One handler per endpoint | Centralized app.ts |
| **CORS** | Repeated in each handler | Single middleware |
| **Error Handling** | Repeated try-catch | Single error handler |
| **Validation** | Per-handler schema | Can be shared |
| **Testing** | Lambda test framework | Supertest |
| **Routing** | API Gateway config | Express routes |

## Next Steps

- [Architecture Overview](./OVERVIEW.md) - System design
- [API Endpoints](../api/ENDPOINTS.md) - All endpoints
- [Getting Started](../setup/GETTING_STARTED.md) - Local development

---

**See Also:**
- [Express.js Documentation](https://expressjs.com/)
- [serverless-http Package](https://github.com/serverless-heaven/serverless-http)
- [AWS Lambda with Express](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html)
