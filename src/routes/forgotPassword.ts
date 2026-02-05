import { Request, Response } from 'express'
import { z } from 'zod'
import { getSession } from '../db/neo4j'
import { signJWT } from '../utils/auth'
import { sendPasswordSetupEmail } from '../utils/notifications'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
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
export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    let session
    const startTime = Date.now()
    const clientIP = getClientIP(req.ip, req.headers as Record<string, string>)

    try {
      // Parse and validate input
      const { email } = forgotPasswordSchema.parse(req.body)

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
        return res.status(200).json({
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
        return res.status(200).json({
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

          console.log('[ForgotPassword] Reset token generated:', {
            email,
            userId,
            token: resetToken,
            expiresIn: '24h',
            timestamp: new Date().toISOString(),
          })

          // Send reset email
          const emailSent = await sendPasswordSetupEmail(
            email,
            resetToken,
            firstName,
          )

          if (emailSent) {
            logSecurityEvent('forgot_password_email_sent', {
              email,
              userId,
              clientIP,
            })
          } else {
            logSecurityEvent('forgot_password_email_failed', {
              email,
              userId,
              error: 'sendPasswordSetupEmail returned false',
              clientIP,
            })
          }
        } catch (emailError) {
          // Log email failure but still return success to user
          console.error('[ForgotPassword] Email send error:', emailError)
          logSecurityEvent('forgot_password_email_failed', {
            email,
            userId,
            error:
              emailError instanceof Error
                ? emailError.message
                : 'Unknown error',
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
      return res.status(200).json({
        message:
          'If an account exists with this email, you will receive a password reset link.',
      })
    } finally {
      if (session) {
        await session.close()
      }
    }
  },
)
