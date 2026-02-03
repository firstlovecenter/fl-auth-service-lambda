# Notification Service Integration

How the Auth Lambda sends transactional emails.

## Overview

The Auth Lambda integrates with the **FLC Notify Service** to send emails for key events:

- **Welcome Email**: New user signup
- **Password Reset Email**: Password changed successfully  
- **Account Deletion Email**: Account deleted
- **Password Setup Email**: User sets password for first time

Emails are sent **asynchronously** - they don't block the API response.

## Architecture

### Services

| Service | Lambda Function | Environment | Sends |
|---------|---|---|---|
| Auth Service | `fl-auth-service-lambda` | Production | User auth requests |
| Auth Service (Dev) | `dev-fl-auth-service-lambda` | Development | Dev requests |
| Notify Service | `flc-notify-service` | Production | Emails |
| Notify Service (Dev) | `dev-flc-notify-service` | Development | Dev emails |

### Communication Flow

```
Auth Lambda (receive request)
        ↓
Process auth (signup, login, etc.)
        ↓
Invoke Notify Lambda asynchronously
        │
        └─→ sendEmail({ type: 'welcome', email, ... })
        │
        └─→ FLC Notify Service Lambda
            ├─ Render email template
            ├─ Send via mail provider
            └─ Log result
        │
        └─ (Auth Lambda continues, doesn't wait)
        ↓
Return response to client
(Email sends in background)
```

## Implementation

### Email Functions (src/utils/notifications.ts)

```typescript
// Generic email sending
async function sendEmail(payload: EmailPayload): Promise<boolean>

// Pre-built templates
async function sendWelcomeEmail(email: string, firstName: string): Promise<boolean>
async function sendPasswordResetEmail(email: string): Promise<boolean>
async function sendAccountDeletionEmail(email: string): Promise<boolean>
async function sendPasswordSetupEmail(email: string): Promise<boolean>
```

### Email Payload Structure

```typescript
interface EmailPayload {
  type: 'welcome' | 'password_reset' | 'account_deletion' | 'password_setup'
  email: string
  firstName?: string
  resetToken?: string  // For password reset links
  // ... other fields
}
```

### Environment Detection

The notification service is automatically selected based on Lambda function name:

```typescript
function getNotifyServiceFunction(): string {
  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME
  
  if (functionName.includes('dev')) {
    return 'dev-flc-notify-service'  // Development
  }
  
  return 'flc-notify-service'  // Production
}
```

## Integration Points

### 1. Signup Route

**When:** User successfully creates account  
**Email Type:** Welcome email

```typescript
// POST /auth/signup
app.post('/auth/signup', async (req, res, next) => {
  // ... create user ...
  
  // Send welcome email (async, don't await)
  sendWelcomeEmail(email, firstName).catch(err => {
    console.error('Welcome email failed:', err)
    // Don't fail signup even if email fails
  })
  
  res.status(201).json({ ... })
})
```

**What Happens:**
- User creation succeeds
- Email is queued to send
- Response returned to client immediately
- Email sends in background

### 2. Password Reset Route

**When:** User successfully resets password  
**Email Type:** Password reset confirmation

```typescript
// POST /auth/reset-password
app.post('/auth/reset-password', async (req, res, next) => {
  // ... validate and update password ...
  
  sendPasswordResetEmail(email).catch(err => {
    console.error('Password reset email failed:', err)
  })
  
  res.status(200).json({ message: 'Password updated' })
})
```

### 3. Account Deletion Route

**When:** User successfully deletes account  
**Email Type:** Account deletion confirmation

```typescript
// DELETE /auth/account
app.delete('/auth/account', async (req, res, next) => {
  // ... delete user from database ...
  
  sendAccountDeletionEmail(email).catch(err => {
    console.error('Deletion email failed:', err)
  })
  
  res.status(200).json({ message: 'Account deleted' })
})
```

### 4. Password Setup Route

**When:** User sets password for first time  
**Email Type:** Password setup confirmation

```typescript
// POST /auth/setup-password
app.post('/auth/setup-password', async (req, res, next) => {
  // ... set password ...
  
  sendPasswordSetupEmail(email).catch(err => {
    console.error('Setup email failed:', err)
  })
  
  res.status(200).json({ message: 'Password set' })
})
```

## Error Handling

Emails are non-critical - they don't block the auth operation:

```typescript
// This pattern is used everywhere
sendWelcomeEmail(email, firstName).catch(err => {
  // Log the error
  console.error('Failed to send welcome email:', err)
  // Don't throw - signup already succeeded
})
```

**Why?** If email sending fails:
- User authentication still succeeds
- Error is logged for debugging
- Can be retried by monitoring
- User isn't blocked

## AWS Setup

### IAM Permissions

Lambda needs permission to invoke the Notify Lambda:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": [
        "arn:aws:lambda:eu-west-2:ACCOUNT-ID:function:flc-notify-service",
        "arn:aws:lambda:eu-west-2:ACCOUNT-ID:function:dev-flc-notify-service"
      ]
    }
  ]
}
```

### Secrets Configuration

The `NOTIFICATION_SECRET_KEY` must be in AWS Secrets Manager:

```json
{
  "NOTIFICATION_SECRET_KEY": "your-secret-key-here",
  "JWT_SECRET": "...",
  "NEO4J_URI": "...",
  ...
}
```

### Testing

To test email integration:

1. **Check CloudWatch Logs**
   ```bash
   aws logs tail /aws/lambda/flc-notify-service --follow --region eu-west-2
   ```

2. **Verify Email Was Queued**
   ```typescript
   // In test
   const result = await sendWelcomeEmail('test@example.com', 'Test')
   expect(result).toBe(true)
   ```

3. **Check Notify Service Response**
   ```bash
   # Look for invoke logs
   aws logs tail /aws/lambda/dev-fl-auth-service-lambda --follow
   ```

## Configuration

### Email Templates

The Notify Service maintains email templates. Contact the team to:
- Add new email types
- Update template content
- Change sender email
- Customize branding

### Retry Logic

Failed emails are retried by the Notify Service:
- Automatic retry on failure
- Retry logic in Notify Lambda
- Logged in CloudWatch

## Monitoring

### Key Metrics

Monitor these in CloudWatch:

- **Email Invocations**: Count of email sends
- **Email Failures**: Count of failed sends
- **Lambda Errors**: Check Notify Lambda error logs
- **Notification Latency**: Time from request to send

### Troubleshooting

**"Invoke Failed" in logs:**
- Check Notify Lambda exists
- Verify IAM permissions
- Check function name (dev vs prod)

**"Email not received by user:**
- Check email address is valid
- Verify email template exists
- Check spam folder
- Review Notify Service logs

## Best Practices

✅ **Do:**
- Always `.catch()` email sending (non-blocking)
- Log email failures for monitoring
- Include user email in logs for debugging
- Test email integration before production
- Monitor Notify Service logs

❌ **Don't:**
- Block auth operations on email failure
- Retry emails in auth service (let Notify Service handle it)
- Store plain text in logs (sanitize sensitive data)
- Send sensitive data in email (passwords, tokens, etc.)

## Next Steps

1. [Deployment Guide](../setup/DEPLOYMENT.md) - Deploy changes
2. [Architecture Overview](./OVERVIEW.md) - Understand system
3. [Getting Started](../setup/GETTING_STARTED.md) - Local development

---

**See Also:**
- [AWS Lambda Invocation](https://docs.aws.amazon.com/lambda/latest/dg/invoking-lambda-function.html)
- [CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/)
