export interface User {
  id: string
  email: string
  password: string
  firstName?: string
  lastName?: string
  isFisher?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ChurchNodeInfo {
  id: string
  name: string
}

export interface MembershipInfo {
  bacenta: ChurchNodeInfo | null
  governorship: ChurchNodeInfo | null
  council: ChurchNodeInfo | null
  stream: ChurchNodeInfo | null
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
