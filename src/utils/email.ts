import * as AWS from 'aws-sdk'

const SES = new AWS.SES({ region: 'us-east-1' }) // Update region as needed

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@example.com'
const APP_URL = process.env.APP_URL || 'https://app.example.com'

interface SendEmailParams {
  to: string
  subject: string
  htmlBody: string
  textBody: string
}

export const sendEmail = async ({
  to,
  subject,
  htmlBody,
  textBody,
}: SendEmailParams): Promise<void> => {
  try {
    await SES.sendEmail({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8',
          },
          Text: {
            Data: textBody,
            Charset: 'UTF-8',
          },
        },
      },
    }).promise()
  } catch (error) {
    console.error('Failed to send email:', error)
    throw error
  }
}

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  firstName?: string,
): Promise<void> => {
  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`
  const name = firstName || 'User'

  const htmlBody = `
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 30px;">
          <h1 style="color: #333; margin-bottom: 20px;">Password Reset Request</h1>
          
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            Hi ${name},
          </p>
          
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            We received a request to set up your password. Click the button below to proceed:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #999; font-size: 14px;">
            Or copy and paste this link into your browser: <br/>
            <span style="word-break: break-all;">${resetLink}</span>
          </p>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.
          </p>
          
          <p style="color: #999; font-size: 12px; margin-top: 20px;">
            Best regards,<br/>
            The Auth Team
          </p>
        </div>
      </body>
    </html>
  `

  const textBody = `
Password Reset Request

Hi ${name},

We received a request to set up your password. Visit this link to proceed:

${resetLink}

This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.

Best regards,
The Auth Team
  `.trim()

  await sendEmail({
    to: email,
    subject: 'Set Your Password - Action Required',
    htmlBody,
    textBody,
  })
}

export const sendWelcomeEmail = async (
  email: string,
  firstName?: string,
): Promise<void> => {
  const name = firstName || 'User'

  const htmlBody = `
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 30px;">
          <h1 style="color: #333; margin-bottom: 20px;">Welcome!</h1>
          
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            Hi ${name},
          </p>
          
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            Your account is now ready. You can login with your credentials.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/login" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
              Go to Login
            </a>
          </div>
          
          <p style="color: #999; font-size: 12px; margin-top: 20px;">
            Best regards,<br/>
            The Auth Team
          </p>
        </div>
      </body>
    </html>
  `

  const textBody = `
Welcome!

Hi ${name},

Your account is now ready. You can login with your credentials.

Go to login: ${APP_URL}/login

Best regards,
The Auth Team
  `.trim()

  await sendEmail({
    to: email,
    subject: 'Welcome to Our Platform',
    htmlBody,
    textBody,
  })
}
