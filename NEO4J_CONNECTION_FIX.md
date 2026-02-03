# Neo4j Connection Issues - Root Cause & Fixes

## Problem Summary
The Lambda function was experiencing `ServiceUnavailable` errors with Neo4j database connections being closed by the server:
- Error: "Connection was closed by server"
- Code: `ServiceUnavailable` (retriable error)
- Symptom: Intermittent connection failures in production

## Root Causes

### 1. **Insufficient Connection Timeout Settings**
- Original timeout: 10 seconds (too aggressive for cloud connections)
- Network latency to dev-neo4j.firstlovecenter.com may exceed this
- When timeout expires, driver kills the connection

### 2. **No Retry Logic for Transient Failures**
- Network glitches would immediately fail the request
- No exponential backoff strategy
- Neo4j recommends retrying transient `ServiceUnavailable` errors

### 3. **Inadequate Connection Pool Management**
- Only set `maxConnectionPoolSize`, not `minConnectionPoolSize`
- No connection keep-alive strategy
- Pool could become stale during idle periods

### 4. **Lambda Container Reuse Issue**
- Database initialized per-request instead of per-container lifecycle
- Multiple concurrent initialization attempts possible
- Secrets Manager called repeatedly for same data

### 5. **Inadequate Lambda Configuration**
- Default timeout too short for database operations
- Memory constraints not optimized
- No VPC configuration for database access

## Solutions Implemented

### 1. **Enhanced Connection Configuration** (`src/db/neo4j.ts`)

```typescript
driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
  maxConnectionPoolSize: 50,
  minConnectionPoolSize: 5,           // ✓ NEW: Maintain minimum connections
  connectionAcquisitionTimeout: 30000, // ✓ INCREASED: 10s → 30s
  maxTransactionRetryTime: 15000,      // ✓ NEW: Retry timeout for transactions
  connectionTimeout: 30000,            // ✓ NEW: Connection establishment timeout
  disableLosslessIntegers: true,
  trust: 'TRUST_ALL_CERTIFICATES',
})
```

### 2. **Exponential Backoff Retry Logic** (`src/db/neo4j.ts`)

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialBackoffMs: 1000,      // 1s initial
  maxBackoffMs: 10000,         // Cap at 10s
}

// Retry strategy: 1s → 2s → 4s
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = RETRY_CONFIG.maxRetries
): Promise<T>
```

### 3. **Prevent Concurrent Initialization**

```typescript
let initializingPromise: Promise<Driver> | null = null

// Multiple requests during startup share the same initialization promise
if (initializingPromise) {
  return initializingPromise
}
```

### 4. **Improved Error Handling** (`src/middleware/errorHandler.ts`)

Added specific handling for database errors:
- `ServiceUnavailable` → HTTP 503 (temporary)
- `Connection was closed` → HTTP 503 (retriable)
- `ECONNREFUSED` → HTTP 503 (temporary)
- `ETIMEDOUT` → HTTP 503 (temporary)

This allows clients to implement intelligent retry strategies.

### 5. **Lambda Configuration Updates** (`serverless.yml`)

```yaml
provider:
  timeout: 60                    # ✓ Increased from default 6s to 60s
  memorySize: 1024              # ✓ Adequate memory allocation
  ephemeralStorageSize: 10240   # ✓ Sufficient temp space
  vpc:                          # ✓ NEW: VPC for database access
    securityGroupIds: [...]
    subnetIds: [...]
```

## Testing the Fixes

### 1. **Local Testing**
```bash
# Start Neo4j locally
docker run --rm -p 7687:7687 neo4j:latest

# Test connection initialization
npm run dev
```

### 2. **Connection Resilience Test**
Kill Neo4j container and restart during request:
- Should retry with backoff
- Should eventually succeed
- Should not consume connection pool

### 3. **Load Testing**
```bash
# Simulate concurrent requests
ab -n 100 -c 10 http://localhost:3000/auth/login
```

## Monitoring & Alerting

### CloudWatch Metrics to Monitor
1. **Database Connection Success Rate**
   - Search: "Successfully connected to Neo4j"
   
2. **Retry Attempts**
   - Search: "Connection attempt.*failed"
   
3. **Connection Pool Health**
   - Monitor Lambda memory usage (pool size affects this)

### Recommended Alarms
- Alert if 503 responses > 5% in 5 min window
- Alert if connection initialization > 30s
- Alert if Neo4j errors occur for > 2 consecutive minutes

## Configuration Variables

Add these to AWS Secrets Manager if using VPC:

```json
{
  "NEO4J_URI": "bolt://dev-neo4j.firstlovecenter.com:7687",
  "NEO4J_USER": "neo4j",
  "NEO4J_PASSWORD": "...",
  "SECURITY_GROUP_ID": "sg-xxxxx",
  "SUBNET_ID_1": "subnet-xxxxx",
  "SUBNET_ID_2": "subnet-xxxxx"
}
```

## Deployment Steps

1. **Update code**
   ```bash
   git pull origin main
   ```

2. **Test locally**
   ```bash
   npm install
   npm run test
   ```

3. **Deploy**
   ```bash
   serverless deploy --stage prod
   ```

4. **Monitor**
   - Watch CloudWatch logs for "Successfully connected"
   - Check error rates drop to < 1%

## Long-term Improvements

1. **Connection Pooling**: Consider using Neo4j Session Manager
2. **Health Checks**: Implement `/health` endpoint that checks DB
3. **Metrics**: Send custom metrics to CloudWatch
4. **Documentation**: Document expected connection timeouts
5. **Load Testing**: Regular load tests against production Neo4j

## References
- [Neo4j Driver Configuration](https://neo4j.com/docs/driver-manual/current/connection-handling/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Neo4j Error Handling](https://neo4j.com/docs/driver-manual/current/errors/)
