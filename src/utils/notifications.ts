import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { getSecret } from './secrets'

/**
 * Notification Service Integration
 * Sends emails via the FLC Notify Service Lambda
 */

interface EmailPayload {
  from: string
  to: string
  subject: string
  text?: string
  html?: string
}

interface NotificationEvent {
  resource: string
  path: string
  httpMethod: string
  headers: {
    'x-secret-key': string
    'content-type': string
  }
  body: string
  isBase64Encoded: boolean
}

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'eu-west-2',
})

/**
 * Determine which notification Lambda to use based on environment
 * Uses ENVIRONMENT from AWS Secrets Manager ("development" or "production")
 */
const getNotificationLambdaName = async (): Promise<string> => {
  const environment = await getSecret('ENVIRONMENT')

  if (environment === 'development') {
    return 'dev-flc-notify-service'
  }

  return 'flc-notify-service'
}

/**
 * Get the secret key for notification service authentication
 * Loaded from AWS Secrets Manager for security
 */
const getNotificationSecretKey = async (): Promise<string> => {
  const key = await getSecret('FLC_NOTIFY_KEY')
  console.log('[Notification] Using FLC_NOTIFY_KEY for authentication')
  return key
}

/**
 * Send an email via the notification service Lambda
 * @param payload - Email details (from, to, subject, text/html)
 * @returns Promise<boolean> - True if email sent successfully
 */
export const sendEmail = async (payload: EmailPayload): Promise<boolean> => {
  try {
    const lambdaName = await getNotificationLambdaName()
    const secretKey = await getNotificationSecretKey()

    console.log('[Notification] Lambda name:', lambdaName)
    console.log(
      '[Notification] Secret key (first 10 chars):',
      secretKey.substring(0, 10) + '...',
    )

    // Construct the notification event
    const event: NotificationEvent = {
      resource: '/send-email',
      path: '/send-email',
      httpMethod: 'POST',
      headers: {
        'x-secret-key': secretKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      isBase64Encoded: false,
    }

    console.log('[Notification] Sending email via', lambdaName, {
      to: payload.to,
      subject: payload.subject,
    })

    // Invoke the notification service Lambda
    const command = new InvokeCommand({
      FunctionName: lambdaName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(event),
    })

    const response = await lambdaClient.send(command)

    console.log('[Notification] Lambda response status:', response.StatusCode)
    console.log('[Notification] Function error:', response.FunctionError)

    // Parse response
    if (response.Payload) {
      const result = JSON.parse(new TextDecoder().decode(response.Payload))

      console.log(
        '[Notification] Response payload:',
        JSON.stringify(result, null, 2),
      )

      if (response.StatusCode === 200 && result.statusCode === 200) {
        console.log('[Notification] Email sent successfully')
        return true
      } else {
        console.error('[Notification] Email sending failed:', result)
        return false
      }
    }

    console.warn('[Notification] No payload in response')
    return false
  } catch (error) {
    console.error('[Notification] Error sending email:', error)
    return false
  }
}

/**
 * Send welcome email to new user
 */
export const sendWelcomeEmail = async (
  email: string,
  firstName?: string,
): Promise<boolean> => {
  const name = firstName || 'there'

  return sendEmail({
    from: 'no-reply@updates.firstlovecenter.com',
    to: email,
    subject: 'Welcome to First Love Center',
    html: `
      <h2>Welcome ${name}!</h2>
      <p>Thank you for creating an account with First Love Center.</p>
      <p>Your account has been successfully created and you can now sign in.</p>
      <p>If you have any questions, please don't hesitate to reach out to our support team.</p>
      <br>
      <p>Best regards,<br>First Love Center Team</p>
    `,
    text: `Welcome ${name}! Thank you for creating an account with First Love Center. Your account has been successfully created and you can now sign in.`,
  })
}

/**
 * Send password reset confirmation email
 */
export const sendPasswordResetEmail = async (
  email: string,
  firstName?: string,
): Promise<boolean> => {
  const name = firstName || 'there'

  return sendEmail({
    from: 'no-reply@updates.firstlovecenter.com',
    to: email,
    subject: 'Password Changed Successfully',
    html: `
      <h2>Password Changed</h2>
      <p>Hi ${name},</p>
      <p>Your password has been successfully changed.</p>
      <p>If you did not make this change, please contact our support team immediately.</p>
      <br>
      <p>Best regards,<br>First Love Center Team</p>
    `,
    text: `Hi ${name}, your password has been successfully changed. If you did not make this change, please contact our support team immediately.`,
  })
}

/**
 * Send password setup email for migrated users
 */
export const sendPasswordSetupEmail = async (
  email: string,
  setupToken: string,
  firstName?: string,
): Promise<boolean> => {
  const name = firstName || 'there'
  const setupLink = `https://your-app-url.com/setup-password?token=${setupToken}` // Update with actual URL

  return sendEmail({
    from: 'no-reply@updates.firstlovecenter.com',
    to: email,
    subject: 'Set Up Your Password - First Love Center',
    html: `
      <h2>Set Up Your Password</h2>
      <p>Hi ${name},</p>
      <p>We've migrated your account to our new authentication system. Please set up your password to continue using your account.</p>
      <p><a href="${setupLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Set Up Password</a></p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all;">${setupLink}</p>
      <p>This link will expire in 24 hours.</p>
      <br>
      <p>Best regards,<br>First Love Center Team</p>
    `,
    text: `Hi ${name}, we've migrated your account to our new authentication system. Please set up your password using this link: ${setupLink}`,
  })
}

/**
 * Send account deletion confirmation email
 */
export const sendAccountDeletionEmail = async (
  email: string,
  firstName?: string,
): Promise<boolean> => {
  const name = firstName || 'there'

  return sendEmail({
    from: 'no-reply@updates.firstlovecenter.com',
    to: email,
    subject: 'Account Deleted - First Love Center',
    html: `
      <h2>Account Deleted</h2>
      <p>Hi ${name},</p>
      <p>Your First Love Center account has been permanently deleted as requested.</p>
      <p>We're sorry to see you go. If you change your mind, you can create a new account at any time.</p>
      <p>If you did not request this deletion, please contact our support team immediately.</p>
      <br>
      <p>Best regards,<br>First Love Center Team</p>
    `,
    text: `Hi ${name}, your First Love Center account has been permanently deleted as requested. If you did not request this, please contact support immediately.`,
  })
}

/**
 * Send forgot-password reset link email
 */
export const sendPasswordResetRequestEmail = async (
  email: string,
  resetToken: string,
  firstName?: string,
): Promise<boolean> => {
  const name = firstName || 'there'
  const resetLink = `https://your-app-url.com/reset-password?token=${resetToken}` // Update with actual URL

  return sendEmail({
    from: 'no-reply@updates.firstlovecenter.com',
    to: email,
    subject: 'Reset Your Password - First Love Center',
    html: `
      <h2>Reset Your Password</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <p><a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all;">${resetLink}</p>
      <p>This link will expire in 24 hours.</p>
      <br>
      <p>Best regards,<br>First Love Center Team</p>
    `,
    text: `Hi ${name}, reset your password using this link: ${resetLink}`,
  })
}
