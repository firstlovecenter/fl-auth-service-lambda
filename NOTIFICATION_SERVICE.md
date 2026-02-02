# Notification Service Integration

This document describes how the auth Lambda integrates with the FLC Notify Service for sending emails.

## Overview

The auth service sends transactional emails for key authentication events:
- **Welcome emails** when users sign up
- **Password reset confirmations** after password changes
- **Account deletion confirmations** when accounts are deleted

## Architecture

### Notification Service Lambda
- **Production**: `flc-notify-service`
- **Development**: `dev-flc-notify-service`

The auth service automatically selects the correct notification Lambda based on the environment it's running in.

### Email Sending Flow
1. User completes an auth action (signup, password reset, account deletion)
2. Auth Lambda invokes the notification service Lambda asynchronously
3. Notification service sends the email
4. If email sending fails, error is logged but the auth request still succeeds

## Implementation

### Email Functions
Located in `src/utils/notifications.ts`:

```typescript
// Generic email sending
sendEmail(payload: EmailPayload): Promise<boolean>

// Pre-built email templates
sendWelcomeEmail(email: string, firstName: string): Promise<boolean>
sendPasswordResetEmail(email: string): Promise<boolean>
sendAccountDeletionEmail(email: string): Promise<boolean>
```

### Integration Points

#### 1. Signup Route (`/auth/signup`)
```typescript
// After successful user creation
sendWelcomeEmail(userEmail, firstName || 'User').catch((error) => {
  console.error('Failed to send welcome email:', error)
})
```

#### 2. Reset Password Route (`/auth/reset-password`)
```typescript
// After password successfully changed
sendPasswordResetEmail(email).catch((error) => {
  console.error('Failed to send password reset email:', error)
})
```

#### 3. Delete Account Route (`/auth/delete-account`)
```typescript
// After account successfully deleted
sendAccountDeletionEmail(userEmail).catch((error) => {
  console.error('Failed to send account deletion email:', error)
})
```

## Configuration

### AWS Secrets Manager
Add the notification service secret key to your secrets:

**Production Secret** (`fl-auth-service-secrets`):
```json
{
  "JWT_SECRET": "your-jwt-secret",
  "PEPPER": "your-pepper",
  "NEO4J_URI": "your-neo4j-uri",
  "NEO4J_USER": "your-neo4j-user",
  "NEO4J_PASSWORD": "your-neo4j-password",
  "NOTIFICATION_SECRET_KEY": "yoGca8BNGus7W3JhnETkKchYR3KJ3sah",
  "ENVIRONMENT": "production"
}
```

**Development Secret** (`dev-fl-auth-service-secrets`):
```json
{
  "JWT_SECRET": "your-dev-jwt-secret",
  "PEPPER": "your-dev-pepper",
  "NEO4J_URI": "your-dev-neo4j-uri",
  "NEO4J_USER": "your-dev-neo4j-user",
  "NEO4J_PASSWORD": "your-dev-neo4j-password",
  "NOTIFICATION_SECRET_KEY": "yoGca8BNGus7W3JhnETkKchYR3KJ3sah",
  "ENVIRONMENT": "development"
}
```

### IAM Permissions
The auth Lambda needs permission to invoke the notification service Lambda.

Add to your Lambda's execution role:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": [
        "arn:aws:lambda:REGION:ACCOUNT_ID:function:flc-notify-service",
        "arn:aws:lambda:REGION:ACCOUNT_ID:function:dev-flc-notify-service"
      ]
    }
  ]
}
```

## Email Templates

### Welcome Email
Sent after successful signup:
```
From: noreply@firstlovecenter.com
To: user@example.com
Subject: Welcome to First Love Center!

Hi [First Name],

Welcome to First Love Center! We're excited to have you as part of our community.

Your account has been successfully created. You can now log in and start exploring.

Best regards,
The First Love Center Team
```

### Password Reset Email
Sent after password change:
```
From: noreply@firstlovecenter.com
To: user@example.com
Subject: Your Password Has Been Changed

Hi,

This email confirms that your password has been successfully changed.

If you did not make this change, please contact our support team immediately.

Best regards,
The First Love Center Team
```

### Account Deletion Email
Sent after account deletion:
```
From: noreply@firstlovecenter.com
To: user@example.com
Subject: Your Account Has Been Deleted

Hi,

This email confirms that your account has been successfully deleted.

If you did not request this deletion, please contact our support team immediately.

Best regards,
The First Love Center Team
```

## Error Handling

Email sending is **non-blocking**:
- Email failures are logged but don't cause the auth request to fail
- Users still receive successful responses for auth actions
- Failed emails can be retried or investigated via CloudWatch logs

## Monitoring

Check CloudWatch logs for email sending activity:

### Successful Email
```
Sending email via flc-notify-service: { to: 'user@example.com', subject: 'Welcome...' }
Email sent successfully to user@example.com
```

### Failed Email
```
Failed to send welcome email: Error: ...
```

## Testing

### Local Testing
You can test email sending locally if you have AWS credentials configured:

```typescript
import { sendWelcomeEmail } from './src/utils/notifications'

// This will invoke the actual Lambda (use dev environment)
await sendWelcomeEmail('test@example.com', 'Test User')
```

### Unit Testing
Mock the Lambda client for unit tests:

```typescript
jest.mock('@aws-sdk/client-lambda')
// Test your routes without actually sending emails
```

## Environment Detection

The service determines the environment from AWS Secrets Manager:

```typescript
// Reads ENVIRONMENT from AWS Secrets Manager
const environment = await getSecret('ENVIRONMENT')

// If ENVIRONMENT === "development" → uses dev-flc-notify-service
// If ENVIRONMENT === "production" → uses flc-notify-service
```

**Production Secret**: Set `"ENVIRONMENT": "production"`
**Development Secret**: Set `"ENVIRONMENT": "development"`

## Dependencies

Required npm packages:
```json
{
  "@aws-sdk/client-lambda": "^3.500.0"
}
```

## Security

- Secret key is stored in AWS Secrets Manager (not in code)
- Lambda invocations use IAM role permissions
- Notification service validates the secret key
- Emails are sent from verified domain address

## Future Enhancements

Potential improvements:
- Add email templates for password setup
- Support HTML email templates with branding
- Add email queueing for retry logic
- Implement email sending analytics
- Add support for SMS notifications
