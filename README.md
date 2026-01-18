# Auth Lambda Microservice

A serverless authentication microservice built with AWS Lambda, Neo4j, and TypeScript.

## Features

- 🔐 User signup with password hashing (bcrypt + pepper)
- 🔑 User login with JWT token generation
- ✅ Token verification
- 🔄 Refresh token support
- 🗄️ Neo4j graph database for user storage
- 📦 TypeScript for type safety
- ⚡ Serverless Framework for deployment

## Project Structure

```
auth-lambda/
├── src/
│   ├── db/
│   │   └── neo4j.ts           # Neo4j database connection
│   ├── handlers/
│   │   ├── signup.ts          # User registration
│   │   ├── login.ts           # User authentication
│   │   ├── verify.ts          # Token verification
│   │   └── refreshToken.ts    # Token refresh
│   ├── utils/
│   │   ├── auth.ts            # Password & JWT utilities
│   │   ├── response.ts        # Lambda response helpers
│   │   └── validation.ts      # Request validation
│   └── types/
│       └── index.ts           # TypeScript interfaces
├── serverless.yml             # Serverless config
├── tsconfig.json              # TypeScript config
└── package.json
```

## Setup

### Prerequisites

- Node.js 20+
- AWS CLI configured
- Neo4j database (local or cloud instance)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:
```env
NEO4J_URI=neo4j://your-neo4j-instance:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
JWT_SECRET=your_strong_secret_key
PEPPER=your_pepper_string
```

4. Build the project:
```bash
npm run build
```

## Development

Run locally with serverless-offline:
```bash
npx serverless offline
```

The API will be available at `http://localhost:3000`

## API Endpoints

### 1. Signup
```http
POST /auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

### 2. Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

Response:
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### 3. Verify Token
```http
POST /auth/verify
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### 4. Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Deployment

Deploy to AWS:
```bash
npm run deploy
```

Deploy to specific stage:
```bash
serverless deploy --stage prod
```

## Security Features

- **Password Hashing**: bcrypt with 12 rounds + pepper
- **JWT Tokens**: 30-minute access tokens, 7-day refresh tokens
- **Input Validation**: Zod schema validation
- **CORS**: Configured for cross-origin requests

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| NEO4J_URI | Neo4j database connection URI | Yes |
| NEO4J_USER | Neo4j username | Yes |
| NEO4J_PASSWORD | Neo4j password | Yes |
| JWT_SECRET | Secret key for JWT signing | Yes |
| PEPPER | Additional password security layer | Yes |

## Neo4j Schema

Users are stored with the following properties:
```cypher
(:User {
  id: String (UUID),
  email: String (unique),
  password: String (hashed),
  firstName: String,
  lastName: String,
  createdAt: DateTime,
  updatedAt: DateTime,
  lastLoginAt: DateTime
})
```

## License

MIT
