# FL Auth Service Lambda - Documentation

Welcome! This directory contains all documentation for the First Love Center Authentication Lambda service.

## 📖 Quick Navigation

**New to this project?** Start here:
1. [Getting Started](./setup/GETTING_STARTED.md) - Local setup and running tests
2. [Architecture Overview](./architecture/OVERVIEW.md) - How the system works
3. [API Reference](./api/ENDPOINTS.md) - Complete endpoint documentation

**Setting up for deployment?**
- [AWS Secrets Manager Setup](./setup/SECRETS_MANAGER.md) - Configure AWS credentials and secrets
- [Deployment Guide](./setup/DEPLOYMENT.md) - Deploy to production or development

**Need to run migrations?**
- [Database Migrations](./guides/DATABASE_MIGRATIONS.md) - Member to User label migration

**Integrations:**
- [Notification Service](./architecture/NOTIFICATIONS.md) - Email integration setup
- [Express.js Implementation](./architecture/EXPRESS_IMPLEMENTATION.md) - Lambda routing architecture

---

## 📁 Documentation Structure

```
docs/
├── README.md (you are here)
├── setup/
│   ├── GETTING_STARTED.md          # Local development setup
│   ├── SECRETS_MANAGER.md          # AWS Secrets Manager configuration
│   └── DEPLOYMENT.md               # Deployment procedures
├── api/
│   └── ENDPOINTS.md                # Complete API reference
├── architecture/
│   ├── OVERVIEW.md                 # System architecture & data flow
│   ├── EXPRESS_IMPLEMENTATION.md    # Express.js & middleware details
│   └── NOTIFICATIONS.md            # Email notification integration
└── guides/
    └── DATABASE_MIGRATIONS.md      # Running member-to-user migrations
```

---

## 🎯 Documentation Goals

This documentation is structured to:
- ✅ **Be discoverable** - Clear structure, easy navigation
- ✅ **Be accurate** - Reflects current code state (Member:User labels, bolt:// protocol)
- ✅ **Be practical** - Provides step-by-step instructions for common tasks
- ✅ **Be comprehensive** - Covers architecture, setup, API, and operations
- ✅ **Be maintainable** - Organized to reduce duplication and conflicts

---

## 🚀 Key Features

- **Express.js Framework**: Single Lambda with Express routing
- **Neo4j Database**: Graph database with dual-label structure (:Member:User)
- **AWS Secrets Manager**: Secure credential management (no environment variables)
- **Dual-Branch Deployment**: Automatic main→prod, dev→dev deployment
- **Email Notifications**: Integration with FLC Notify Service for transactional emails
- **Type Safety**: Full TypeScript implementation with strict mode
- **Security**: bcrypt + pepper password hashing, JWT tokens, Zod validation

---

## 💡 Common Tasks

### "I want to understand the system"
→ Read [Architecture Overview](./architecture/OVERVIEW.md)

### "I want to set up locally"
→ Follow [Getting Started](./setup/GETTING_STARTED.md)

### "I want to call an API endpoint"
→ Check [API Endpoints](./api/ENDPOINTS.md)

### "I want to deploy to production"
→ Follow [Deployment Guide](./setup/DEPLOYMENT.md)

### "I want to run the database migration"
→ Read [Database Migrations](./guides/DATABASE_MIGRATIONS.md)

### "I need to configure AWS Secrets"
→ See [Secrets Manager Setup](./setup/SECRETS_MANAGER.md)

### "I want to understand the middleware"
→ Check [Express Implementation](./architecture/EXPRESS_IMPLEMENTATION.md)

### "I need to set up emails"
→ Read [Notifications](./architecture/NOTIFICATIONS.md)

---

## 📊 System Diagram

```
Client Request
      ↓
API Gateway (HTTP)
      ↓
Lambda (Node.js + Express)
      ├→ Route Handler (e.g., /auth/login)
      ├→ Middleware Chain
      │  ├→ Request Logger
      │  ├→ Body Parser
      │  └→ Error Handler
      ├→ Database Query (Neo4j)
      ├→ Email Notification (Async)
      └→ Response
      ↓
Client Response (JSON)
```

---

## 🔐 Security

- **Secrets Storage**: AWS Secrets Manager (not environment variables)
- **Password Hashing**: bcrypt with pepper (additional salt)
- **Token Authentication**: JWT with 30-min access, 7-day refresh
- **Input Validation**: Zod schema validation on all inputs
- **Error Handling**: Consistent error responses without leaking internals

---

## 📚 Additional Resources

- [Neo4j Documentation](https://neo4j.com/docs/)
- [AWS Lambda Guide](https://docs.aws.amazon.com/lambda/)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Serverless Framework](https://www.serverless.com/)

---

## ❓ Questions?

If documentation is unclear or missing, please:
1. Check if there's a related file in this docs folder
2. Search the root README.md for additional context
3. Review inline code comments in `src/`
4. Check git history for context on recent changes

---

**Last Updated:** February 2026  
**Current Version:** Node 18+, TypeScript 5.3, Express 4.18
