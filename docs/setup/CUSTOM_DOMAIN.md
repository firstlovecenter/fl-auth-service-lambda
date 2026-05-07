# Custom Domain & SSL Certificate Setup

Complete guide to deploying your Auth Lambda with a custom domain and SSL certificate on AWS.

## Overview

This guide sets up:
- ✅ Custom domain (e.g., `auth.yourdomain.com`)
- ✅ SSL/TLS certificate (HTTPS)
- ✅ API Gateway custom domain mapping
- ✅ Route 53 DNS configuration (or your DNS provider)

**Result**: Your API accessible at `https://auth.yourdomain.com/auth/login` instead of the default API Gateway URL.

## Quick Visual Guide (AWS Console)

```
Step 1: ACM Console (Certificate Manager)
   → Request certificate
   → Enter domain name
   → Choose DNS validation
   → Create CNAME records
   → Wait for "Issued" status ✅

Step 2: Deploy Lambda
   → serverless deploy

Step 3: API Gateway Console
   → Custom domain names
   → Create domain
   → Select certificate
   → Configure API mapping
   → Note target domain name

Step 4: Route 53 Console (or DNS provider)
   → Create A record (Alias)
   → Point to API Gateway
   
Step 5: Test
   → curl https://auth.yourdomain.com
```

## Prerequisites

- ✅ AWS account with admin access
- ✅ Domain name (managed in Route 53 or external DNS provider)
- ✅ Lambda function already deployed
- ✅ AWS CLI configured (`aws configure`)
- ✅ Serverless Framework installed: `npm install -g serverless`

## Choose Your Method

### Method 1: Automated Setup (Serverless Plugin) - For Developers
Best for automation and CI/CD. Uses CLI commands and configuration files.
→ [Jump to Method 1](#method-1-using-serverless-domain-manager-plugin-recommended)

### Method 2: Manual Setup (AWS Console) - For AWS Console Users  
**Detailed GUI steps with screenshots descriptions.** Best for visual learners.
→ [Jump to Method 2](#method-2-manual-setup-using-aws-console-gui-steps)

---

## Method 1: Using Serverless Domain Manager Plugin (Recommended)

This automates the entire process.

### Step 1: Install the Plugin

```bash
npm install --save-dev serverless-domain-manager
```

### Step 2: Update serverless.yml

Add the plugin and domain configuration to your `serverless.yml`:

```yaml
service: auth-lambda

useDotenv: true

plugins:
  - serverless-plugin-typescript
  - serverless-offline
  - serverless-domain-manager  # Add this

provider:
  name: aws
  runtime: nodejs18.x
  region: eu-west-2  # Must match certificate region
  timeout: 60
  memorySize: 1024
  ephemeralStorageSize: 10240
  architecture: arm64
  environment:
    NEO4J_URI: ${env:NEO4J_URI}
    NEO4J_USER: ${env:NEO4J_USER}
    NEO4J_PASSWORD: ${env:NEO4J_PASSWORD}
    NEO4J_ENCRYPTED: ${env:NEO4J_ENCRYPTED, 'false'}
    JWT_SECRET: ${env:JWT_SECRET}
    PEPPER: ${env:PEPPER}
  vpc:
    securityGroupIds:
      - ${env:SECURITY_GROUP_ID}
    subnetIds:
      - ${env:SUBNET_ID_1}
      - ${env:SUBNET_ID_2}

# Add custom domain configuration
customDomain:
  domainName: auth.yourdomain.com  # Replace with your domain
  basePath: ''  # Empty for root, or use 'api' for /api prefix
  stage: ${self:provider.stage}
  certificateName: '*.yourdomain.com'  # Wildcard cert
  createRoute53Record: true  # Auto-create DNS record
  endpointType: 'regional'  # or 'edge' for CloudFront
  securityPolicy: tls_1_2
  apiType: rest
  autoDomain: true

functions:
  api:
    handler: src/index.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
      - http:
          path: /
          method: ANY
          cors: true
```

### Step 3: Request SSL Certificate in ACM

**Important**: Certificate must be in the same region as your API Gateway.

#### Option A: Using AWS Console

1. Go to **AWS Certificate Manager** (ACM) in AWS Console
2. Select region **eu-west-2** (same as your Lambda)
3. Click **Request a certificate**
4. Choose **Request a public certificate**
5. Enter domain names:
   - `auth.yourdomain.com` (specific subdomain)
   - OR `*.yourdomain.com` (wildcard for all subdomains)
6. Choose **DNS validation** (recommended)
7. Click **Request**
8. Add the CNAME records to your DNS provider (shown in ACM)
9. Wait for status to change to **Issued** (~5-30 minutes)

#### Option B: Using AWS CLI

```bash
# Request certificate
aws acm request-certificate \
  --domain-name auth.yourdomain.com \
  --subject-alternative-names *.yourdomain.com \
  --validation-method DNS \
  --region eu-west-2

# Note the CertificateArn from output
# Example: arn:aws:acm:eu-west-2:123456789012:certificate/abc-123

# Get validation CNAME records
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:eu-west-2:123456789012:certificate/abc-123 \
  --region eu-west-2
```

Copy the CNAME name and value, and add to your DNS provider.

#### DNS Validation (Route 53)

If using Route 53:

```bash
# ACM can auto-create validation records in Route 53
# Just click "Create records in Route 53" in the console
```

If using external DNS provider (e.g., Cloudflare, Namecheap):
1. Copy CNAME name: `_abc123.auth.yourdomain.com`
2. Copy CNAME value: `_xyz789.acm-validations.aws.`
3. Add CNAME record in your DNS provider
4. Wait for validation (~5-30 minutes)

### Step 4: Create Custom Domain

```bash
# This creates the custom domain mapping in API Gateway
serverless create_domain --aws-profile default
```

**Expected output:**
```
Serverless: Custom domain auth.yourdomain.com was created.
            New domain name will become available within 40 minutes.
Serverless: Custom domain auth.yourdomain.com was mapped to API.
```

**Wait 20-40 minutes** for API Gateway to provision the custom domain.

### Step 5: Deploy Your Lambda

```bash
# Deploy to the custom domain
serverless deploy --aws-profile default
```

This deploys your Lambda and maps it to the custom domain.

### Step 6: Configure DNS (If Not Using Route 53)

If `createRoute53Record: false` or using external DNS:

#### Get the API Gateway Target Domain

```bash
# List custom domains
aws apigateway get-domain-names --region eu-west-2

# Find your domain and note the:
# - distributionDomainName (for edge endpoint)
# - regionalDomainName (for regional endpoint)
```

#### Add DNS Record

For **Regional Endpoint** (recommended):
```
Type: A (Alias) or CNAME
Name: auth.yourdomain.com
Value: <regionalDomainName from above>
       Example: d-abc123.execute-api.eu-west-2.amazonaws.com
TTL: 300
```

For **Edge Endpoint** (CloudFront):
```
Type: A (Alias) or CNAME
Name: auth.yourdomain.com
Value: <distributionDomainName from above>
       Example: d123abc.cloudfront.net
TTL: 300
```

#### Route 53 Example:

```bash
# Get hosted zone ID
aws route53 list-hosted-zones

# Create alias record
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "auth.yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z1234567890ABC",
          "DNSName": "d-abc123.execute-api.eu-west-2.amazonaws.com",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

### Step 7: Verify Deployment

Wait 5-10 minutes for DNS propagation, then test:

```bash
# Test your custom domain
curl https://auth.yourdomain.com/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'

# Check SSL certificate
curl -vI https://auth.yourdomain.com 2>&1 | grep -i "SSL\|certificate"
```

**Expected**: HTTPS works with valid SSL certificate.

## Method 2: Manual Setup Using AWS Console (GUI Steps)

If you prefer using the AWS Console instead of the plugin:

### Step 1: Request SSL Certificate in ACM Console

1. **Navigate to Certificate Manager**
   - Sign in to AWS Console
   - Search for "Certificate Manager" or "ACM" in the top search bar
   - **Important**: Select region **EU (London) eu-west-2** from the top-right dropdown
   - Click **Request a certificate**

2. **Configure Certificate**
   - Select **Request a public certificate**
   - Click **Next**

3. **Enter Domain Names**
   - **Domain name**: Enter `auth.yourdomain.com`
   - Click **Add another name to this certificate**
   - **Additional name**: Enter `*.yourdomain.com` (for wildcard support)
   - Click **Next**

4. **Select Validation Method**
   - Choose **DNS validation - recommended**
   - Click **Next**

5. **Add Tags (Optional)**
   - Key: `Name`, Value: `Auth Lambda Certificate`
   - Key: `Environment`, Value: `Production`
   - Click **Next**

6. **Review and Request**
   - Review your settings
   - Click **Request**

7. **Validate Certificate**
   - You'll see status **Pending validation**
   - Expand the domain name to see CNAME records
   
   **For Route 53 Users:**
   - Click **Create records in Route 53** button
   - Confirm by clicking **Create records**
   - Wait 5-10 minutes for validation
   
   **For External DNS Providers:**
   - Note the **CNAME name**: `_abc123def456.auth.yourdomain.com`
   - Note the **CNAME value**: `_xyz789.acm-validations.aws.`
   - Log into your DNS provider (Cloudflare, Namecheap, GoDaddy, etc.)
   - Add a new CNAME record with these values
   - Wait 5-30 minutes for validation

8. **Confirm Validation**
   - Refresh the ACM page
   - Status should change to **Issued**
   - **Note the Certificate ARN** (e.g., `arn:aws:acm:eu-west-2:123456789012:certificate/abc-123`)

### Step 2: Deploy Your Lambda Function

Before configuring the custom domain, ensure your Lambda is deployed:

1. **Using Serverless Framework**
   ```bash
   serverless deploy --aws-profile default
   ```

2. **Note Your API Gateway Details**
   - After deployment, note the **API endpoint URL**
   - Example: `https://abc123xyz.execute-api.eu-west-2.amazonaws.com/dev`
   - Extract the API ID: `abc123xyz`

### Step 3: Create Custom Domain in API Gateway Console

1. **Navigate to API Gateway**
   - Go to AWS Console
   - Search for "API Gateway"
   - Ensure region is **eu-west-2** (top-right)

2. **Open Custom Domain Names**
   - In left sidebar, click **Custom domain names**
   - Click **Create** button

3. **Configure Domain**
   - **Domain name**: `auth.yourdomain.com`
   - **TLS version**: Select **TLS 1.2 (recommended)**
   
4. **Endpoint Configuration**
   - Select **Regional**
   - **ACM certificate**: Choose the certificate you created in Step 1
     - If it doesn't appear, verify:
       - Certificate is **Issued** (not Pending)
       - Certificate is in **eu-west-2** region
       - Certificate covers your domain name

5. **Create Domain**
   - Click **Create domain name**
   - Wait 20-40 minutes for provisioning
   - Status will show **Available** when ready
   - **Note the Target domain name** (e.g., `d-abc123.execute-api.eu-west-2.amazonaws.com`)

### Step 4: Configure API Mappings

1. **While Still in Custom Domain Names**
   - Click on your domain name (`auth.yourdomain.com`)
   - Go to **API mappings** tab
   - Click **Configure API mappings**

2. **Add Mapping**
   - Click **Add new mapping**
   - **API**: Select your API from dropdown (should start with "dev-" or your service name)
   - **Stage**: Select your stage (e.g., `dev` or `prod`)
   - **Path**: Leave empty for root path, or enter `api` for `/api` prefix
   - Click **Save**

### Step 5: Configure DNS in Route 53 (or External DNS)

#### Option A: Using Route 53 Console

1. **Navigate to Route 53**
   - Go to AWS Console
   - Search for "Route 53"
   - Click **Hosted zones** in left sidebar

2. **Select Your Domain**
   - Click on your domain (e.g., `yourdomain.com`)

3. **Create A Record (Alias)**
   - Click **Create record**
   - **Record name**: Enter `auth` (for auth.yourdomain.com)
   - **Record type**: Select **A - Routes traffic to an IPv4 address**
   - **Toggle Alias**: Turn ON (switch to YES)
   - **Route traffic to**: Select **Alias to API Gateway API**
   - **Region**: Select **Europe (London) [eu-west-2]**
   - **API Gateway endpoint**: Select your custom domain from dropdown
     - Should show: `auth.yourdomain.com (d-abc123.execute-api.eu-west-2.amazonaws.com)`
   - **Routing policy**: Simple routing
   - **Evaluate target health**: No
   - Click **Create records**

4. **Verify DNS Record**
   - You should see the new A record in your hosted zone
   - Type: A, Name: auth.yourdomain.com, Alias: Yes

#### Option B: Using External DNS Provider (Cloudflare, Namecheap, etc.)

1. **Get Target Domain from API Gateway**
   - Go to API Gateway Console
   - Click **Custom domain names**
   - Click on your domain (`auth.yourdomain.com`)
   - Copy **API Gateway domain name** (e.g., `d-abc123.execute-api.eu-west-2.amazonaws.com`)

2. **Add DNS Record**
   - Log into your DNS provider
   - Go to DNS management for your domain
   
   **For Cloudflare:**
   - Click **Add record**
   - Type: `CNAME`
   - Name: `auth`
   - Target: `d-abc123.execute-api.eu-west-2.amazonaws.com`
   - Proxy status: DNS only (gray cloud)
   - TTL: Auto
   - Save
   
   **For Namecheap:**
   - Host: `auth`
   - Type: `CNAME Record`
   - Value: `d-abc123.execute-api.eu-west-2.amazonaws.com`
   - TTL: Automatic
   - Save
   
   **For GoDaddy:**
   - Type: `CNAME`
   - Name: `auth`
   - Value: `d-abc123.execute-api.eu-west-2.amazonaws.com`
   - TTL: 1 Hour
   - Save

### Step 6: Test Your Custom Domain

Wait 5-10 minutes for DNS propagation, then test:

1. **Test in Browser**
   - Open: `https://auth.yourdomain.com/auth/login`
   - You should see SSL padlock icon
   - May get error response (expected - we're just testing connection)

2. **Test with cURL**
   ```bash
   curl -I https://auth.yourdomain.com/auth/login
   ```
   - Should return HTTP 200 or 400 (not 404 or SSL errors)

3. **Test Full Request**
   ```bash
   curl https://auth.yourdomain.com/auth/login \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "Test123!"
     }'
   ```

4. **Verify SSL Certificate**
   ```bash
   # Check certificate details
   openssl s_client -connect auth.yourdomain.com:443 -servername auth.yourdomain.com < /dev/null 2>&1 | grep -A 5 "Certificate chain"
   ```

### Step 7: Troubleshooting in Console

**Certificate Not Showing in API Gateway:**
- Go to ACM Console
- Verify certificate status is **Issued** (not Pending validation)
- Verify certificate is in **eu-west-2** region
- Refresh API Gateway page

**Custom Domain Shows "Unavailable":**
- Wait 20-40 minutes after creation
- Check CloudWatch logs for errors
- Verify certificate is valid

**DNS Not Resolving:**
- Check DNS propagation: `dig auth.yourdomain.com`
- Wait 5-10 minutes
- Verify DNS record exists in Route 53 or DNS provider
- Check record type is correct (A record for Route 53, CNAME for others)

**403 Forbidden Error:**
- Go to API Gateway Console
- Click your API → Stages → Your stage
- Verify stage is deployed (shows date/time)
- Check API mappings are correct in Custom Domain Names

**SSL Certificate Error in Browser:**
- Go to ACM Console
- Verify certificate covers your domain
- Check certificate is in **eu-west-2** region
- Wait 20-40 minutes if just created custom domain

## Multi-Environment Setup

### Production Domain

```yaml
# In serverless.yml
customDomain:
  domainName: auth.yourdomain.com
  basePath: ''
  stage: prod
  certificateName: '*.yourdomain.com'
  createRoute53Record: true
```

### Development Domain

```yaml
# Create serverless.dev.yml or use stage-specific config
customDomain:
  domainName: auth-dev.yourdomain.com
  basePath: ''
  stage: dev
  certificateName: '*.yourdomain.com'
  createRoute53Record: true
```

Deploy to each:

```bash
# Production
serverless deploy --stage prod

# Development
serverless deploy --stage dev
```

## Troubleshooting

### Certificate Not Validated

**Issue**: Certificate stuck in "Pending validation"

**Solution**:
1. Check DNS records are correct (CNAME for validation)
2. Wait up to 30 minutes
3. Verify CNAME in DNS: `nslookup -type=CNAME _abc123.auth.yourdomain.com`

### Custom Domain Creation Fails

**Issue**: `InvalidCertificateArn`

**Solution**:
- Certificate must be in **same region** as API Gateway
- Use `--region eu-west-2` when requesting certificate

### DNS Not Resolving

**Issue**: `curl: (6) Could not resolve host: auth.yourdomain.com`

**Solution**:
1. Check DNS propagation: `dig auth.yourdomain.com`
2. Wait 5-10 minutes for DNS propagation
3. Verify DNS record exists in Route 53 or DNS provider

### SSL Certificate Warning

**Issue**: Browser shows "Certificate not valid"

**Solution**:
- Verify certificate covers your domain (`auth.yourdomain.com` or `*.yourdomain.com`)
- Check certificate status in ACM is **Issued**
- Wait 20-40 minutes after creating custom domain

### 403 Forbidden Error

**Issue**: `{"message":"Forbidden"}`

**Solution**:
1. Check base path mapping is correct
2. Verify API Gateway stage is deployed
3. Check API Gateway has correct Lambda permissions

```bash
# Redeploy API Gateway
serverless deploy --aws-profile default
```

### Plugin Command Fails

**Issue**: `serverless create_domain` fails

**Solution**:
```bash
# Check plugin is installed
npm list serverless-domain-manager

# Reinstall if needed
npm install --save-dev serverless-domain-manager

# Check serverless.yml syntax
serverless print
```

## Maintenance

### Update Certificate (Before Expiration)

AWS auto-renews ACM certificates if DNS validation records remain in place. No action needed!

### Change Domain Name

```bash
# Delete old domain
serverless delete_domain --aws-profile default

# Update serverless.yml with new domain
# Then create new domain
serverless create_domain --aws-profile default

# Redeploy
serverless deploy --aws-profile default
```

### Remove Custom Domain

```bash
# Delete domain mapping
serverless delete_domain --aws-profile default

# Or manually:
aws apigateway delete-domain-name \
  --domain-name auth.yourdomain.com \
  --region eu-west-2
```

## Best Practices

1. ✅ **Use wildcard certificates**: `*.yourdomain.com` covers all subdomains
2. ✅ **Regional endpoints**: Lower latency, simpler setup than edge
3. ✅ **DNS validation**: Easier than email validation, auto-renews
4. ✅ **Route 53**: Simplifies DNS management if domain is in AWS
5. ✅ **TLS 1.2+**: Required for PCI compliance and security
6. ✅ **Separate domains**: Use different domains for dev/prod
7. ✅ **Monitor expiration**: Set CloudWatch alarm for certificate expiration

## Cost Considerations

- **ACM Certificates**: FREE
- **API Gateway Custom Domain**: FREE
- **Route 53 Hosted Zone**: ~$0.50/month per zone
- **Route 53 Queries**: $0.40 per million queries

## Quick Reference Commands

```bash
# Install plugin
npm install --save-dev serverless-domain-manager

# Request certificate
aws acm request-certificate \
  --domain-name auth.yourdomain.com \
  --validation-method DNS \
  --region eu-west-2

# Create custom domain
serverless create_domain

# Deploy
serverless deploy

# Delete custom domain
serverless delete_domain

# Check custom domains
aws apigateway get-domain-names --region eu-west-2

# Check certificates
aws acm list-certificates --region eu-west-2

# Test SSL
curl -vI https://auth.yourdomain.com
```

## Next Steps

- [Update API Documentation](../api/ENDPOINTS.md) with new domain
- Configure CORS with new domain
- Update client applications with new API URL
- Set up CloudWatch alarms for domain health

---

**See Also:**
- [AWS Certificate Manager Documentation](https://docs.aws.amazon.com/acm/)
- [API Gateway Custom Domains](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-custom-domains.html)
- [Serverless Domain Manager Plugin](https://github.com/amplify-education/serverless-domain-manager)
- [Route 53 Documentation](https://docs.aws.amazon.com/route53/)
