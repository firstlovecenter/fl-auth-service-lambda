import express, { Request, Response, NextFunction } from 'express'
import { corsMiddleware } from './middleware/cors'
import { requireBearerAuth } from './middleware/auth'
import { requestIdMiddleware, requestLogger } from './middleware/requestLogger'
import { jsonBodyParser, validateBody } from './middleware/bodyParser'
import { errorHandler, asyncHandler } from './middleware/errorHandler'
import { z } from 'zod'
import { initializeDB } from './db/neo4j'

// Route imports
import { signup } from './routes/signup'
import { login } from './routes/login'
import { logout } from './routes/logout'
import { verify } from './routes/verify'
import { refreshToken } from './routes/refreshToken'
import { setupPassword } from './routes/setupPassword'
import { forgotPassword } from './routes/forgotPassword'
import { resetPassword } from './routes/resetPassword'
import { deleteAccount } from './routes/deleteAccount'
import { getChurches } from './routes/getChurches'
import { jwks } from './routes/jwks'
import { externalToken } from './routes/external/token'
import { authorizeGet } from './routes/external/authorize'
import { authorizeSubmit } from './routes/external/authorizeSubmit'

// Initialize Express app
const app = express()

// Initialize DB only for auth routes (avoid /health)
app.use('/auth', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await initializeDB()
    next()
  } catch (error) {
    next(error)
  }
})

// ──────────────────────────────────────────────────────────────────────────────
// Middleware Setup (Production-Ready)
// ──────────────────────────────────────────────────────────────────────────────

// 1. Request ID tracking for debugging
app.use(requestIdMiddleware as express.RequestHandler)

// 2. CORS headers
app.use(corsMiddleware)

// 3. Custom JSON body parser with error handling
app.use(jsonBodyParser)

// 4. Request logging for monitoring (10k users scale)
app.use(requestLogger as express.RequestHandler)

// ──────────────────────────────────────────────────────────────────────────────
// Health Check Endpoint
// ──────────────────────────────────────────────────────────────────────────────

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// External SSO — JWKS (public, no DB dependency)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /.well-known/jwks.json
 * Public key for verifying RS256-signed external-SSO identity tokens.
 */
app.get('/.well-known/jwks.json', jwks)

// ──────────────────────────────────────────────────────────────────────────────
// Authentication Routes
// ──────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/signup
 * Create a new user account
 * Body: { email, password, firstName?, lastName? }
 */
app.post('/auth/signup', signup)

/**
 * POST /auth/login
 * Authenticate user. Sets the refresh token as an httpOnly cookie (SYN-173)
 * and returns the access token in the body. The refresh token is never
 * returned in the body — the cookie is the sole transport (SYN-188).
 * Body: { email, password }
 * Returns: { tokens: { accessToken }, user, membership }
 */
app.post('/auth/login', login)

/**
 * POST /auth/logout
 * Clear the httpOnly refresh-token cookie (SYN-173)
 * Returns: { message }
 */
app.post('/auth/logout', logout)

/**
 * POST /auth/verify
 * Verify access token and get user data
 * Body: { token }
 * Returns: { valid, user }
 */
app.post('/auth/verify', verify)

/**
 * POST /auth/refresh-token
 * Get a new access token. Reads the refresh token solely from the httpOnly
 * cookie (SYN-173/188) — no request body is used.
 * Returns: { accessToken }
 */
app.post('/auth/refresh-token', refreshToken)

/**
 * POST /auth/setup-password
 * Complete password setup for users migrated from legacy systems
 * Body: { setup_token, new_password, confirm_password }
 * Returns: { message, user }
 */
app.post('/auth/setup-password', setupPassword)

/**
 * POST /auth/forgot-password
 * Request a password reset link
 * Body: { email }
 * Returns: { message } (always success to prevent enumeration)
 */
app.post('/auth/forgot-password', forgotPassword)

/**
 * POST /auth/reset-password
 * Allow authenticated users to change their password
 * Body: { email, currentPassword, newPassword, confirmPassword }
 * Returns: { message, user }
 */
app.post('/auth/reset-password', resetPassword)

/**
 * DELETE /auth/delete-account
 * Permanently delete user account (requires Bearer token)
 * Body: { confirmDeletion: true }
 * Returns: { message, accountId }
 */
app.delete('/auth/delete-account', requireBearerAuth, deleteAccount)

/**
 * POST /auth/churches
 * Fetch church list for authenticated user (requires Bearer token)
 * Body: { email? }
 */
app.post('/auth/churches', requireBearerAuth, getChurches)

// ──────────────────────────────────────────────────────────────────────────────
// External SSO (OAuth2 authorization-code flow) — server-to-server
// ──────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/external/token
 * Exchange a single-use authorization code for an RS256-signed identity
 * token. Server-to-server only (camp-app backend, never the browser).
 * Body: { code, client_id, client_secret, redirect_uri }
 */
app.post('/auth/external/token', externalToken)

// ──────────────────────────────────────────────────────────────────────────────
// External SSO — user-facing authorize + hosted login page
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /auth/external/authorize
 * Entry point external apps redirect the browser to. Validates the client
 * before rendering anything, reuses an existing FLC session if present,
 * otherwise shows the hosted login page.
 * Query: client_id, redirect_uri, state, response_type=code
 */
app.get('/auth/external/authorize', authorizeGet)

/**
 * POST /auth/external/authorize/submit
 * Called by the hosted login page's own JS. Authenticates via the same
 * logic /auth/login uses, then issues a single-use code.
 * Body: { client_id, redirect_uri, state, email, password }
 */
app.post('/auth/external/authorize/submit', authorizeSubmit)

// ──────────────────────────────────────────────────────────────────────────────
// 404 Handler
// ──────────────────────────────────────────────────────────────────────────────

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method,
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Global Error Handler (Must be last)
// ──────────────────────────────────────────────────────────────────────────────

app.use(errorHandler)

export default app
