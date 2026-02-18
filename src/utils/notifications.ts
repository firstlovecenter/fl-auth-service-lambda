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
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to First Love Center</title>
  </head>
  <body style="background-color:rgb(248,248,248);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto','Oxygen','Ubuntu','Cantarell','Fira Sans','Droid Sans','Helvetica Neue',sans-serif;padding:40px 20px;margin:0">
    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
      <tbody>
        <tr>
          <td>
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(255,255,255);max-width:640px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.08)">
              <tbody>
                <!-- Header Section -->
                <tr>
                  <td style="background:linear-gradient(135deg,rgb(220,38,38),rgb(190,24,24));padding:60px 40px;text-align:center;color:rgb(255,255,255)">
                    <div style="font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;opacity:0.9;margin-bottom:16px">Welcome Aboard</div>
                    <h1 style="font-size:36px;font-weight:700;margin:0;margin-bottom:12px;letter-spacing:-0.5px">First Love Center</h1>
                    <p style="font-size:18px;margin:0;opacity:0.95;font-weight:300;line-height:28px">Your account is ready to go</p>
                  </td>
                </tr>

                <!-- Main Content -->
                <tr>
                  <td style="padding:60px 48px">
                    <!-- Greeting -->
                    <p style="font-size:18px;color:rgb(31,41,55);margin:0 0 8px 0;font-weight:500;line-height:28px">Hi ${name},</p>

                    <!-- Body Text -->
                    <p style="font-size:16px;color:rgb(75,85,99);line-height:26px;margin:24px 0 0 0;font-weight:400">
                      Your account has been successfully created. Welcome to our community.
                    </p>

                    <!-- Info Box -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(255,250,250);border-left:3px solid rgb(220,38,38);margin:36px 0 0 0;border-radius:0 8px 8px 0">
                      <tbody>
                        <tr>
                          <td style="padding:24px 24px">
                            <div style="font-size:13px;color:rgb(107,114,128);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:8px">Getting Started</div>
                            <p style="font-size:16px;color:rgb(55,65,81);margin:0;line-height:24px;font-weight:400">
                              Sign in now to access your account and get started.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>



                    <!-- Bottom Text -->
                    <p style="font-size:15px;color:rgb(75,85,99);line-height:24px;margin:32px 0 0 0;font-weight:400">
                      If you have questions or need assistance, please reach out to your ministry admin or support team. We're here to help.
                    </p>

                    <!-- Sign Off -->
                    <p style="font-size:15px;color:rgb(55,65,81);line-height:24px;margin:28px 0 0 0;font-weight:400">
                      Best regards,<br>
                      <span style="font-weight:600">First Love Center Team</span>
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 40px">
                    <div style="border-top:1px solid rgb(243,244,246)"></div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:32px 48px;background-color:rgb(250,250,250)">
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:0;font-weight:400">
                      You received this email because an account was created with this address. If you didn't create this account, please ignore this message.
                    </p>
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:16px 0 0 0;font-weight:400">
                      Please do not reply to this email — this inbox is unmonitored.
                    </p>
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:20px 0 0 0;font-weight:400">
                      First Love Center<br>
                      Accra
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`,
    text: `Hi ${name},

Your account has been successfully created. Welcome to First Love Center.

If you have any questions, please reach out to your ministry admin or support team.

Best regards,
First Love Center Team`,
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
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Password Changed Successfully</title>
  </head>
  <body style="background-color:rgb(248,248,248);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto','Oxygen','Ubuntu','Cantarell','Fira Sans','Droid Sans','Helvetica Neue',sans-serif;padding:40px 20px;margin:0">
    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
      <tbody>
        <tr>
          <td>
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(255,255,255);max-width:640px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.08)">
              <tbody>
                <!-- Header Section -->
                <tr>
                  <td style="background:linear-gradient(135deg,rgb(220,38,38),rgb(190,24,24));padding:60px 40px;text-align:center;color:rgb(255,255,255)">
                    <div style="font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;opacity:0.9;margin-bottom:16px">Success</div>
                    <h1 style="font-size:36px;font-weight:700;margin:0;margin-bottom:12px;letter-spacing:-0.5px">Password Updated</h1>
                    <p style="font-size:18px;margin:0;opacity:0.95;font-weight:300;line-height:28px">Your account is now secure</p>
                  </td>
                </tr>

                <!-- Main Content -->
                <tr>
                  <td style="padding:60px 48px">
                    <!-- Greeting -->
                    <p style="font-size:18px;color:rgb(31,41,55);margin:0 0 8px 0;font-weight:500;line-height:28px">Hi ${name},</p>

                    <!-- Body Text -->
                    <p style="font-size:16px;color:rgb(75,85,99);line-height:26px;margin:24px 0 0 0;font-weight:400">
                      Your password has been successfully changed. Your account is now protected with your new password.
                    </p>

                    <!-- Info Box -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(254,242,242);border-left:3px solid rgb(220,38,38);margin:36px 0 0 0;border-radius:0 8px 8px 0">
                      <tbody>
                        <tr>
                          <td style="padding:24px 24px">
                            <div style="font-size:13px;color:rgb(107,114,128);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:8px">Account Security</div>
                            <p style="font-size:16px;color:rgb(55,65,81);margin:0;line-height:24px;font-weight:400">
                              This change affects only your account. No action is needed from you.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Warning Section -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(254,252,232);border-left:3px solid rgb(202,138,4);margin:24px 0 0 0;border-radius:0 8px 8px 0">
                      <tbody>
                        <tr>
                          <td style="padding:24px 24px">
                            <div style="font-size:13px;color:rgb(107,114,128);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:8px">Didn't Request This?</div>
                            <p style="font-size:16px;color:rgb(55,65,81);margin:0;line-height:24px;font-weight:400">
                              If you did not make this change, please contact our support team immediately.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Sign Off -->
                    <p style="font-size:15px;color:rgb(75,85,99);line-height:24px;margin:40px 0 0 0;font-weight:400">
                      Best regards,<br>
                      <span style="font-weight:600">First Love Center Team</span>
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 40px">
                    <div style="border-top:1px solid rgb(243,244,246)"></div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:32px 48px;background-color:rgb(250,250,250)">
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:0;font-weight:400">
                      This is an automated notification from your First Love Center account.
                    </p>
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:16px 0 0 0;font-weight:400">
                      Please do not reply to this email — this inbox is unmonitored.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`,
    text: `Hi ${name},

Your password has been successfully changed. Your account is now protected with your new password.

If you did not make this change, please contact our support team immediately.

Best regards,
First Love Center Team`,
  })
}

/**
 * Send password setup email
 */
export const sendPasswordSetupEmail = async (
  email: string,
  setupToken: string,
  firstName?: string,
): Promise<boolean> => {
  const name = firstName || 'there'
  const appUrl = await getSecret('SYNAGO_APP_URL')
  const setupLink = `${appUrl}/setup-password?token=${setupToken}`

  return sendEmail({
    from: 'no-reply@updates.firstlovecenter.com',
    to: email,
    subject: 'Set Up Your Password - First Love Center',
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Set Up Your Password</title>
  </head>
  <body style="background-color:rgb(248,248,248);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto','Oxygen','Ubuntu','Cantarell','Fira Sans','Droid Sans','Helvetica Neue',sans-serif;padding:40px 20px;margin:0">
    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
      <tbody>
        <tr>
          <td>
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(255,255,255);max-width:640px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.08)">
              <tbody>
                <!-- Header Section -->
                <tr>
                  <td style="background:linear-gradient(135deg,rgb(220,38,38),rgb(190,24,24));padding:60px 40px;text-align:center;color:rgb(255,255,255)">
                    <div style="font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;opacity:0.9;margin-bottom:16px">Action Required</div>
                    <h1 style="font-size:36px;font-weight:700;margin:0;margin-bottom:12px;letter-spacing:-0.5px">Set Up Your Password</h1>
                    <p style="font-size:18px;margin:0;opacity:0.95;font-weight:300;line-height:28px">Complete your account setup</p>
                  </td>
                </tr>

                <!-- Main Content -->
                <tr>
                  <td style="padding:60px 48px">
                    <!-- Greeting -->
                    <p style="font-size:18px;color:rgb(31,41,55);margin:0 0 8px 0;font-weight:500;line-height:28px">Hi ${name},</p>

                    <!-- Body Text -->
                    <p style="font-size:16px;color:rgb(75,85,99);line-height:26px;margin:24px 0 0 0;font-weight:400">
                      To complete your account setup and secure your access, please set a password now. This step takes just a moment.
                    </p>

                    <!-- Info Box -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(254,242,242);border-left:3px solid rgb(220,38,38);margin:36px 0 0 0;border-radius:0 8px 8px 0">
                      <tbody>
                        <tr>
                          <td style="padding:24px 24px">
                            <div style="font-size:13px;color:rgb(107,114,128);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:8px">Time-Sensitive</div>
                            <p style="font-size:16px;color:rgb(55,65,81);margin:0;line-height:24px;font-weight:400">
                              This link will expire in 24 hours. Set up your password now to secure your account.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- CTA Button -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:40px 0 0 0">
                      <tbody>
                        <tr>
                          <td align="center">
                            <a href="${setupLink}" target="_blank" style="display:inline-block;background-color:rgb(220,38,38);color:rgb(255,255,255);text-decoration:none;font-weight:600;font-size:16px;line-height:20px;padding:16px 32px;border-radius:10px;box-shadow:0 2px 8px rgba(220,38,38,0.3);transition:all 0.2s ease">Set Up Password</a>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Fallback Link -->
                    <p style="font-size:14px;color:rgb(107,114,128);line-height:22px;margin:24px 0 0 0;text-align:center">
                      Or copy and paste this link:<br>
                      <span style="color:rgb(220,38,38);word-break:break-all;font-weight:500;font-size:13px">${setupLink}</span>
                    </p>

                    <!-- Bottom Text -->
                    <p style="font-size:15px;color:rgb(75,85,99);line-height:24px;margin:32px 0 0 0;font-weight:400">
                      If you did not request this, you can safely ignore this message.
                    </p>

                    <!-- Sign Off -->
                    <p style="font-size:15px;color:rgb(55,65,81);line-height:24px;margin:28px 0 0 0;font-weight:400">
                      Best regards,<br>
                      <span style="font-weight:600">First Love Center Team</span>
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 40px">
                    <div style="border-top:1px solid rgb(243,244,246)"></div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:32px 48px;background-color:rgb(250,250,250)">
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:0;font-weight:400">
                      This is an automated notification from your First Love Center account.
                    </p>
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:16px 0 0 0;font-weight:400">
                      Please do not reply to this email — this inbox is unmonitored.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`,
    text: `Hi ${name},

To complete your account setup, please set your password using the link below:

${setupLink}

This link will expire in 24 hours.

If you did not request this, you can safely ignore this message.

Best regards,
First Love Center Team`,
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
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Account Deleted</title>
  </head>
  <body style="background-color:rgb(248,248,248);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto','Oxygen','Ubuntu','Cantarell','Fira Sans','Droid Sans','Helvetica Neue',sans-serif;padding:40px 20px;margin:0">
    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
      <tbody>
        <tr>
          <td>
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(255,255,255);max-width:640px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.08)">
              <tbody>
                <!-- Header Section -->
                <tr>
                  <td style="background:linear-gradient(135deg,rgb(220,38,38),rgb(190,24,24));padding:60px 40px;text-align:center;color:rgb(255,255,255)">
                    <div style="font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;opacity:0.9;margin-bottom:16px">Confirmation</div>
                    <h1 style="font-size:36px;font-weight:700;margin:0;margin-bottom:12px;letter-spacing:-0.5px">Account Deleted</h1>
                    <p style="font-size:18px;margin:0;opacity:0.95;font-weight:300;line-height:28px">Your data has been removed</p>
                  </td>
                </tr>

                <!-- Main Content -->
                <tr>
                  <td style="padding:60px 48px">
                    <!-- Greeting -->
                    <p style="font-size:18px;color:rgb(31,41,55);margin:0 0 8px 0;font-weight:500;line-height:28px">Hi ${name},</p>

                    <!-- Body Text -->
                    <p style="font-size:16px;color:rgb(75,85,99);line-height:26px;margin:24px 0 0 0;font-weight:400">
                      Your First Love Center account has been permanently deleted as requested. All associated data has been removed from our systems.
                    </p>

                    <!-- Info Box -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(254,242,242);border-left:3px solid rgb(220,38,38);margin:36px 0 0 0;border-radius:0 8px 8px 0">
                      <tbody>
                        <tr>
                          <td style="padding:24px 24px">
                            <div style="font-size:13px;color:rgb(107,114,128);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:8px">Permanent Action</div>
                            <p style="font-size:16px;color:rgb(55,65,81);margin:0;line-height:24px;font-weight:400">
                              This action is permanent and cannot be undone.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Body Text -->
                    <p style="font-size:16px;color:rgb(75,85,99);line-height:26px;margin:32px 0 0 0;font-weight:400">
                      We're sorry to see you go. If you change your mind, you can create a new account at any time.
                    </p>

                    <!-- Warning Section -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(254,252,232);border-left:3px solid rgb(202,138,4);margin:24px 0 0 0;border-radius:0 8px 8px 0">
                      <tbody>
                        <tr>
                          <td style="padding:24px 24px">
                            <div style="font-size:13px;color:rgb(107,114,128);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:8px">Didn't Request This?</div>
                            <p style="font-size:16px;color:rgb(55,65,81);margin:0;line-height:24px;font-weight:400">
                              If you did not request this deletion, please contact our support team immediately.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Sign Off -->
                    <p style="font-size:15px;color:rgb(75,85,99);line-height:24px;margin:40px 0 0 0;font-weight:400">
                      Best regards,<br>
                      <span style="font-weight:600">First Love Center Team</span>
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 40px">
                    <div style="border-top:1px solid rgb(243,244,246)"></div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:32px 48px;background-color:rgb(250,250,250)">
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:0;font-weight:400">
                      This is an automated confirmation from First Love Center.
                    </p>
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:16px 0 0 0;font-weight:400">
                      Please do not reply to this email — this inbox is unmonitored.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`,
    text: `Hi ${name},

Your First Love Center account has been permanently deleted as requested. All associated data has been removed from our systems.

If you did not request this deletion, please contact our support team immediately.

We're sorry to see you go. You can create a new account at any time.

Best regards,
First Love Center Team`,
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
  const appUrl = await getSecret('SYNAGO_APP_URL')
  const resetLink = `${appUrl}/reset-password?token=${resetToken}`

  return sendEmail({
    from: 'no-reply@updates.firstlovecenter.com',
    to: email,
    subject: 'Reset Your Password - First Love Center',
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Your Password</title>
  </head>
  <body style="background-color:rgb(248,248,248);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto','Oxygen','Ubuntu','Cantarell','Fira Sans','Droid Sans','Helvetica Neue',sans-serif;padding:40px 20px;margin:0">
    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
      <tbody>
        <tr>
          <td>
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(255,255,255);max-width:640px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.08)">
              <tbody>
                <!-- Header Section -->
                <tr>
                  <td style="background:linear-gradient(135deg,rgb(220,38,38),rgb(190,24,24));padding:60px 40px;text-align:center;color:rgb(255,255,255)">
                    <div style="font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;opacity:0.9;margin-bottom:16px">Security</div>
                    <h1 style="font-size:36px;font-weight:700;margin:0;margin-bottom:12px;letter-spacing:-0.5px">Reset Your Password</h1>
                    <p style="font-size:18px;margin:0;opacity:0.95;font-weight:300;line-height:28px">Secure your account in one step</p>
                  </td>
                </tr>

                <!-- Main Content -->
                <tr>
                  <td style="padding:60px 48px">
                    <!-- Greeting -->
                    <p style="font-size:18px;color:rgb(31,41,55);margin:0 0 8px 0;font-weight:500;line-height:28px">Hi ${name},</p>

                    <!-- Body Text -->
                    <p style="font-size:16px;color:rgb(75,85,99);line-height:26px;margin:24px 0 0 0;font-weight:400">
                      We received a request to reset your password. Click the button below to create a new password. This link will expire in 24 hours.
                    </p>

                    <!-- Info Box -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(254,242,242);border-left:3px solid rgb(220,38,38);margin:36px 0 0 0;border-radius:0 8px 8px 0">
                      <tbody>
                        <tr>
                          <td style="padding:24px 24px">
                            <div style="font-size:13px;color:rgb(107,114,128);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:8px">Time-Sensitive Link</div>
                            <p style="font-size:16px;color:rgb(55,65,81);margin:0;line-height:24px;font-weight:400">
                              This link expires in 24 hours. Reset your password now to maintain account security.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- CTA Button -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:40px 0 0 0">
                      <tbody>
                        <tr>
                          <td align="center">
                            <a href="${resetLink}" target="_blank" style="display:inline-block;background-color:rgb(220,38,38);color:rgb(255,255,255);text-decoration:none;font-weight:600;font-size:16px;line-height:20px;padding:16px 32px;border-radius:10px;box-shadow:0 2px 8px rgba(220,38,38,0.3);transition:all 0.2s ease">Reset Password</a>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Fallback Link -->
                    <p style="font-size:14px;color:rgb(107,114,128);line-height:22px;margin:24px 0 0 0;text-align:center">
                      Or copy and paste this link:<br>
                      <span style="color:rgb(220,38,38);word-break:break-all;font-weight:500;font-size:13px">${resetLink}</span>
                    </p>

                    <!-- Warning Section -->
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:rgb(254,242,242);border-left:3px solid rgb(220,38,38);margin:32px 0 0 0;border-radius:0 8px 8px 0">
                      <tbody>
                        <tr>
                          <td style="padding:24px 24px">
                            <div style="font-size:13px;color:rgb(107,114,128);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:8px">Didn't Request This?</div>
                            <p style="font-size:16px;color:rgb(55,65,81);margin:0;line-height:24px;font-weight:400">
                              If you didn't request a password reset, you can safely ignore this message. Your password has not been changed.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Sign Off -->
                    <p style="font-size:15px;color:rgb(75,85,99);line-height:24px;margin:40px 0 0 0;font-weight:400">
                      Best regards,<br>
                      <span style="font-weight:600">First Love Center Team</span>
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 40px">
                    <div style="border-top:1px solid rgb(243,244,246)"></div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:32px 48px;background-color:rgb(250,250,250)">
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:0;font-weight:400">
                      This is an automated notification from your First Love Center account.
                    </p>
                    <p style="font-size:13px;color:rgb(107,114,128);line-height:20px;margin:16px 0 0 0;font-weight:400">
                      Please do not reply to this email — this inbox is unmonitored.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`,
    text: `Hi ${name},

We received a request to reset your password. Click the link below to create a new password:

${resetLink}

This link will expire in 24 hours.

If you didn't request a password reset, you can safely ignore this message. Your password has not been changed.

Best regards,
First Love Center Team`,
  })
}
