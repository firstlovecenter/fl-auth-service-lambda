/**
 * Rate limiting and security utilities
 * Prevents brute force attacks and timing attacks
 */

interface RateLimitConfig {
  maxAttempts: number
  windowMs: number
  blockDurationMs: number
}

// In-memory store (use Redis in production)
const rateLimitStore = new Map<
  string,
  { attempts: number; blockedUntil: number }
>()

/**
 * Rate limiting with exponential backoff
 * Prevents brute force and enumeration attacks
 *
 * TEMPORARILY DISABLED FOR TESTING
 */
export const checkRateLimit = (
  identifier: string,
  config: RateLimitConfig = {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 60 * 60 * 1000, // 1 hour
  },
): { allowed: boolean; retryAfter?: number } => {
  // TESTING: Rate limiting disabled
  return { allowed: true }

  /* const now = Date.now()
  const stored = rateLimitStore.get(identifier)

  // Check if currently blocked
  if (stored && stored.blockedUntil > now) {
    const retryAfter = Math.ceil((stored.blockedUntil - now) / 1000)
    return { allowed: false, retryAfter }
  }

  // Reset if window expired
  if (
    !stored ||
    now - (stored.blockedUntil - config.blockDurationMs) > config.windowMs
  ) {
    rateLimitStore.set(identifier, {
      attempts: 1,
      blockedUntil: now + config.windowMs,
    })
    return { allowed: true }
  }

  // Increment attempts
  stored.attempts += 1

  // Block if exceeded
  if (stored.attempts > config.maxAttempts) {
    stored.blockedUntil = now + config.blockDurationMs
    const retryAfter = Math.ceil(config.blockDurationMs / 1000)
    return { allowed: false, retryAfter }
  }

  return { allowed: true } */
}

/**
 * Timing-safe delay to prevent enumeration attacks
 * Ensures response time is consistent regardless of user existence
 *
 * TEMPORARILY DISABLED FOR TESTING
 */
export const constantTimeDelay = async (
  minimumMs: number = 100,
  maximumMs: number = 300,
): Promise<void> => {
  // TESTING: Delay disabled
  return

  /* // Random delay between min and max to prevent timing attacks
  const delay = Math.random() * (maximumMs - minimumMs) + minimumMs
  return new Promise((resolve) => setTimeout(resolve, delay)) */
}

/**
 * Check if IP should be throttled
 * Prevents distributed brute force attacks
 *
 * TEMPORARILY DISABLED FOR TESTING
 */
export const checkIPThrottle = (ipAddress: string): boolean => {
  // TESTING: IP throttling disabled
  return true

  /* // TODO: Implement with Redis for production
  // For now, basic in-memory check
  const limit = checkRateLimit(`ip:${ipAddress}`, {
    maxAttempts: 20,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 5 * 60 * 1000, // 5 minutes
  })
  return limit.allowed */
}

/**
 * Log security events for audit trail
 */
export const logSecurityEvent = (
  event: string,
  details: Record<string, any>,
  ipAddress?: string,
): void => {
  const timestamp = new Date().toISOString()
  const log = {
    timestamp,
    event,
    ipAddress,
    ...details,
  }

  // Log to CloudWatch or your logging service
  console.log(JSON.stringify(log))

  // TODO: Send to security monitoring service
  // - DataDog
  // - Splunk
  // - PagerDuty
  // - Custom SIEM
}

/**
 * Extract client IP from request
 * Handles CloudFront and API Gateway proxies
 */
export const getClientIP = (
  sourceIP?: string,
  headers?: Record<string, any>,
): string => {
  // Check X-Forwarded-For first (CloudFront/API Gateway)
  if (headers?.['x-forwarded-for']) {
    return headers['x-forwarded-for'].split(',')[0].trim()
  }

  // Fallback to sourceIP
  return sourceIP || 'unknown'
}

/**
 * Validate email with temporary hold to prevent user enumeration
 * Prevents dictionary attacks where attacker learns valid emails
 */
export const validateEmailExists = async (
  email: string,
  checkFunction: (email: string) => Promise<boolean>,
): Promise<{ exists: boolean; shouldWait: boolean }> => {
  const exists = await checkFunction(email)

  // Always add small delay to prevent timing attacks
  await constantTimeDelay(50, 150)

  return {
    exists,
    shouldWait: !exists, // Wait longer if email doesn't exist (to match success case)
  }
}
