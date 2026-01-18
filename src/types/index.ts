export interface User {
  id: string
  email: string
  password: string
  firstName?: string
  lastName?: string
  createdAt: Date
  updatedAt: Date
}

export interface JWTPayload {
  userId: string
  email: string
  iat?: number
  exp?: number
}

export interface SignupRequest {
  email: string
  password: string
  firstName?: string
  lastName?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface VerifyRequest {
  token: string
}

export interface RefreshTokenRequest {
  refreshToken: string
}
