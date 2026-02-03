import express, { Request, Response, NextFunction } from 'express'
import { corsMiddleware } from './middleware/cors'
import { requestIdMiddleware, requestLogger } from './middleware/requestLogger'
import { jsonBodyParser, validateBody } from './middleware/bodyParser'
import { errorHandler, asyncHandler } from './middleware/errorHandler'
import { z } from 'zod'

// Route imports
import { signup } from './routes/signup'
import { login } from './routes/login'
import { verify } from './routes/verify'
import { refreshToken } from './routes/refreshToken'
import { setupPassword } from './routes/setupPassword'
import { forgotPassword } from './routes/forgotPassword'
import { resetPassword } from './routes/resetPassword'
import { deleteAccount } from './routes/deleteAccount'

// Initialize Express app
const app = express()

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
 * Authenticate user and get tokens
 * Body: { email, password }
 * Returns: { accessToken, refreshToken, user, roles }
 */
app.post('/auth/login', login)

/**
 * POST /auth/verify
 * Verify access token and get user data
 * Body: { token }
 * Returns: { valid, user }
 */
app.post('/auth/verify', verify)

/**
 * POST /auth/refresh-token
 * Get new access token using refresh token
 * Body: { refreshToken }
 * Returns: { accessToken }
 */
app.post('/auth/refresh-token', refreshToken)

/**
 * POST /auth/setup-password
 * Complete password setup for users migrated from legacy systems
 * Body: { setup_token, new_password, confirm_password }
 * Returns: { accessToken, refreshToken, user }
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
 * Permanently delete user account (requires token verification)
 * Body: { token, confirmDeletion: true }
 * Returns: { message, accountId }
 */
app.delete('/auth/delete-account', deleteAccount)

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
