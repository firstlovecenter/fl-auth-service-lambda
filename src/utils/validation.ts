import { z } from 'zod'

export const parseError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unknown error occurred'
}

export const parseRequestBody = (body: string | null): any => {
  if (!body) {
    throw new Error('Request body is required')
  }

  try {
    const parsed = JSON.parse(body)
    if (!parsed || Object.keys(parsed).length === 0) {
      throw new Error('Request body cannot be empty')
    }
    return parsed
  } catch {
    throw new Error('Invalid JSON in request body')
  }
}
