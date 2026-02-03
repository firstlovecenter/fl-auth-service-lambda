# Getting Started - Local Development

Get up and running with the FL Auth Lambda in 5 minutes.

## Prerequisites

- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **npm 8+** - Comes with Node.js
- **Git** - For cloning and version control
- **Neo4j Database** - For local testing (optional, see below)

## Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url> fl-auth-lambda
cd fl-auth-lambda

# Install dependencies
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

The `.env` file only needs:
```env
AWS_SECRET_NAME=dev/fl-admin-portal
```

All other secrets (JWT_SECRET, NEO4J credentials, etc.) are loaded from AWS Secrets Manager at runtime.

### 3. Set Up AWS Access (Required for real database)

If you have AWS credentials configured:
```bash
aws configure
# or set environment variables:
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=eu-west-2
```

To verify AWS access:
```bash
aws secretsmanager get-secret-value --secret-id dev/fl-admin-portal --region eu-west-2
```

If this fails, you'll need AWS credentials. Contact the team for access.

### 4. Build TypeScript

```bash
npm run build
```

Compiled code goes to `dist/` directory.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-run on file changes)
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

Tests cover:
- ✅ Migration script (label addition)
- ✅ Auth flows (login, signup, token refresh)
- ✅ NULL password handling
- ✅ Database queries with User labels

## Running Locally

### Option A: Using AWS Secrets (Recommended)

If you have AWS access:

```bash
# Start the server
npm run dev
```

Server starts at `http://localhost:3000`. The Lambda entry point loads real secrets from AWS Secrets Manager.

### Option B: Without AWS Access (Testing Only)

For testing without AWS:
```bash
# Run tests (mocked secrets)
npm test

# Run TypeScript check
npm run type-check
```

## Project Structure

```
src/
├── index.ts                 # Lambda entry point
├── app.ts                   # Express app with all routes
├── middleware/              # Request handling middleware
├── routes/                  # 7 auth endpoints
├── handlers/                # Original Lambda handlers (reference)
├── db/                      # Neo4j database setup
├── utils/                   # Auth, secrets, validation
└── types/                   # TypeScript interfaces

docs/                        # Documentation
scripts/                     # Migration scripts

tests/                       # Integration tests
```

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Start local server |
| `npm test` | Run test suite |
| `npm run type-check` | Check TypeScript without building |
| `npm run migrate:members-to-users -- --environment development --dry-run` | Test migration (dry-run) |

## Environment Variables

Only this is required in `.env`:
```env
AWS_SECRET_NAME=dev/fl-admin-portal
```

All other configuration comes from AWS Secrets Manager at runtime:
- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`
- `JWT_SECRET`
- `PEPPER`
- `NOTIFICATION_SECRET_KEY`

**Note**: These are loaded automatically - no need to set them locally.

## Troubleshooting

### "Cannot find module 'neo4j-driver'"
```bash
# Solution: Install dependencies
npm install
```

### "Failed to load secrets from AWS Secrets Manager"
```bash
# Solution 1: Check AWS access
aws configure

# Solution 2: Run tests instead (uses mocked secrets)
npm test
```

### "TypeScript compilation errors"
```bash
# Solution: Check tsconfig
npm run type-check
```

### "Database connection refused"
- Ensure you have the correct `dev/fl-admin-portal` secret in AWS Secrets Manager
- Check your AWS region is set to `eu-west-2`
- Verify network access to `dev-neo4j.firstlovecenter.com:7687`

## Next Steps

1. **Understand the Architecture** → Read [Architecture Overview](../architecture/OVERVIEW.md)
2. **Learn the API** → Check [API Endpoints](../api/ENDPOINTS.md)
3. **Deploy to Production** → Follow [Deployment Guide](./DEPLOYMENT.md)
4. **Configure Secrets** → See [Secrets Manager Setup](./SECRETS_MANAGER.md)

## Learning Resources

- [Express.js Handbook](https://expressjs.com/)
- [Neo4j Query Language (Cypher)](https://neo4j.com/docs/cypher-manual/)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/)
- [JWT.io](https://jwt.io/)

---

**Need help?** Check the [Architecture Overview](../architecture/OVERVIEW.md) or look for inline code comments in `src/`.
