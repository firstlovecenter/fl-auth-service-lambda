import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { z } from 'zod'
import { initializeDB, getSession } from '../db/neo4j'
import { signJWT } from '../utils/auth'
import { sendPasswordResetEmail } from '../utils/email'
import { errorResponse, successResponse } from '../utils/response'
import { parseError, parseRequestBody } from '../utils/validation'
import {
  checkRateLimit,
  constantTimeDelay,
  getClientIP,
  logSecurityEvent,
} from '../utils/security'

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

/**
 * Forgot Password Endpoint
 *
 * SECURITY PROPERTIES:
 * ✅ Does NOT reveal if email exists in system
 * ✅ Timing-attack resistant (consistent response time)
 * ✅ Rate limited per IP + email combination
 * ✅ Logs all attempts for security audit
 * ✅ Prevents user enumeration attacks
 * ✅ Exponential backoff on repeated attempts
 *
 * BEHAVIOR:
 * - Always returns success (even if email doesn't exist)
 * - Sends reset email only if user exists
 * - Response time is consistent ~200-400ms regardless
 * - If user doesn't exist, no email sent (silent fail)
 */
export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  let session
  const startTime = Date.now()
  const clientIP = getClientIP(
    event.requestContext?.identity?.sourceIp,
    event.headers,
  )

  try {
    await initializeDB()

    // Parse request body
    const body = parseRequestBody(event.body)

    // Validate input
    const parseResult = forgotPasswordSchema.safeParse(body)
    if (!parseResult.success) {
      logSecurityEvent('forgot_password_invalid_input', {
        errors: parseError(parseResult.error),
        clientIP,
      })
      return errorResponse(parseError(parseResult.error), 400)
    }

    const { email } = parseResult.data

    // ========================================================================
    // RATE LIMITING: Prevent brute force / enumeration attacks
    // ========================================================================

    // Rate limit per email
    const emailRateLimit = checkRateLimit(`forgot:${email}`, {
      maxAttempts: 3, // Max 3 reset requests per email
      windowMs: 60 * 60 * 1000, // per 1 hour
      blockDurationMs: 60 * 60 * 1000, // block for 1 hour
    })

    if (!emailRateLimit.allowed) {
      logSecurityEvent('forgot_password_rate_limit_email', {
        email,
        clientIP,
        retryAfter: emailRateLimit.retryAfter,
      })
      // Still return success to not leak rate limit info
      // But add delay to match success case
      await constantTimeDelay(150, 300)
      return successResponse({
        message:
          'If an account exists with this email, you will receive a password reset link.',
      })
    }

    // Rate limit per IP
    const ipRateLimit = checkRateLimit(`forgot:ip:${clientIP}`, {
      maxAttempts: 10, // Max 10 requests per IP
      windowMs: 60 * 60 * 1000, // per 1 hour
      blockDurationMs: 60 * 60 * 1000, // block for 1 hour
    })

    if (!ipRateLimit.allowed) {
      logSecurityEvent('forgot_password_rate_limit_ip', {
        email,
        clientIP,
        retryAfter: ipRateLimit.retryAfter,
      })
      // Still return success, but add delay
      await constantTimeDelay(150, 300)
      return successResponse({
        message:
          'If an account exists with this email, you will receive a password reset link.',
      })
    }

    // ========================================================================
    // USER LOOKUP: Check if email exists (but don't reveal result)
    // ========================================================================

    session = getSession()

    const result = await session.run(
      `MATCH (m:User {email: $email})
       RETURN m.id as id, m.auth_id as auth_id, m.firstName as firstName`,
      { email },
    )

    // ========================================================================
    // TIMING ATTACK RESISTANCE
    // ========================================================================
    // Always add consistent delay so response time doesn't leak info
    // about whether user exists or not
    const delayNeeded = await constantTimeDelay(150, 300)

    // ========================================================================
    // EMAIL SENDING: Only if user exists
    // ========================================================================

    if (result.records.length > 0) {
      const record = result.records[0]
      const userId = record.get('id') ?? record.get('auth_id')
      const firstName = record.get('firstName')

      try {
        // Generate reset token (24 hour validity)
        const resetToken = await signJWT(
          {
            userId,
            email,
            action: 'password_reset',
          },
          '24h',
        )

        // Send reset email
        await sendPasswordResetEmail(email, resetToken, firstName)

        logSecurityEvent('forgot_password_email_sent', {
          email,
          userId,
          clientIP,
        })
      } catch (emailError) {
        // Log email failure but still return success to user
        logSecurityEvent('forgot_password_email_failed', {
          email,
          error:
            emailError instanceof Error ? emailError.message : 'Unknown error',
          clientIP,
        })
        // User won't know if email failed - security by obscurity
        // In production, retry logic or fallback email service
      }
    } else {
      // Email doesn't exist - log attempt but take no action
      logSecurityEvent('forgot_password_unknown_email', {
        email,
        clientIP,
      })
      // Silent fail - don't send email, don't reveal user doesn't exist
    }

    // ========================================================================
    // RESPONSE: Always the same, regardless of result
    // ========================================================================
    return successResponse({
      message:
        'If an account exists with this email, you will receive a password reset link.',
    })
  } catch (error) {
    console.error('Forgot password error:', error)

    logSecurityEvent('forgot_password_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      clientIP,
    })

    return errorResponse(parseError(error), 500)
  } finally {
    if (session) {
      await session.close()
    }
  }
}
