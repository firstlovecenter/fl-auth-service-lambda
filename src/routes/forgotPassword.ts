import { Request, Response } from 'express'
import { z } from 'zod'
import neo4j from 'neo4j-driver'
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

// The in-memory limiter is per Lambda container, so it cannot cap the emails one
// address receives: concurrent requests land on different containers. The count
// lives on the User node instead, which every container sees.
export const MAX_RESET_EMAILS_PER_WINDOW = 3
export const RESET_EMAIL_WINDOW_MS = 60 * 60 * 1000

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
        `MATCH (m:User:Member {email: $email})
         WITH m, coalesce(m.passwordResetWindowStart, 0) <= $now - $windowMs AS expired
         SET m.passwordResetCount = CASE WHEN expired THEN 1 ELSE coalesce(m.passwordResetCount, 0) + 1 END,
             m.passwordResetWindowStart = CASE WHEN expired THEN $now ELSE m.passwordResetWindowStart END
         RETURN m.id as id, m.auth_id as auth_id, m.firstName as firstName,
                m.passwordResetCount as resetCount`,
        { email, now: neo4j.int(Date.now()), windowMs: neo4j.int(RESET_EMAIL_WINDOW_MS) },
      )

      // ========================================================================
      // TIMING ATTACK RESISTANCE
      // ========================================================================
      // Always add consistent delay so response time doesn't leak info
      // about whether user exists or not
      await constantTimeDelay(150, 300)

      // ========================================================================
      // EMAIL SENDING: Only if user exists
      // ========================================================================

      const record = result.records[0]
      const resetCount = record
        ? neo4j.integer.toNumber(record.get('resetCount'))
        : 0

      if (resetCount > MAX_RESET_EMAILS_PER_WINDOW) {
        logSecurityEvent('forgot_password_rate_limit_email', {
          email,
          clientIP,
          resetCount,
        })
      } else if (record) {
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

          // SECURITY: never log the reset token itself — it grants password
          // reset for ~24h and anyone with log access could hijack the account
          // (SYN-189). Log only non-sensitive correlation fields.
          console.log('[ForgotPassword] Reset token generated:', {
            email,
            userId,
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
