export interface User {
  id: string
  email: string
  password: string
  firstName?: string
  lastName?: string
  email_verified?: boolean
  migration_completed?: boolean
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

export interface ResetPasswordRequest {
  reset_token: string
  new_password: string
  confirm_password: string
}

export interface ForgotPasswordRequest {
  email: string
}
