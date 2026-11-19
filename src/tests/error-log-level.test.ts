/**
 * Unit tests for the error handler's log level (SYN-255).
 *
 * Pure logic — no Neo4j required. Expected user-facing refusals (4xx) must
 * log at WARN so they stop raising error tickets; real failures stay at ERROR.
 */

import type { Request, Response } from 'express'
import { z } from 'zod'
import {
  ApiError,
  errorHandler,
  logLevelForError,
} from '../middleware/errorHandler'

const makeReq = () =>
  ({ id: 'req-1', path: '/auth/login', method: 'POST' } as unknown as Request)

const makeRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res as Response & { status: jest.Mock; json: jest.Mock }
}

const zodError = () => {
  const result = z.object({ email: z.string().email() }).safeParse({ email: 'x' })
  if (result.success) throw new Error('expected a validation failure')
  return result.error
}

describe('logLevelForError', () => {
  it.each([400, 401, 403, 404, 429])('logs a %i ApiError at warn', (status) => {
    expect(logLevelForError(new ApiError(status, 'refused'))).toBe('warn')
  })

  it('logs a 5xx ApiError at error', () => {
    expect(logLevelForError(new ApiError(500, 'boom'))).toBe('error')
  })

  it('logs validation and bad-token errors at warn', () => {
    expect(logLevelForError(zodError())).toBe('warn')
    const jwt = new Error('jwt malformed')
    jwt.name = 'JsonWebTokenError'
    expect(logLevelForError(jwt)).toBe('warn')
    expect(logLevelForError(new Error('Invalid or expired token'))).toBe('warn')
  })

  it('logs database and unknown failures at error', () => {
    expect(logLevelForError(new Error('ServiceUnavailable: no route'))).toBe('error')
    expect(logLevelForError(new Error('something broke'))).toBe('error')
    expect(logLevelForError('a string')).toBe('error')
  })
})

describe('errorHandler logging', () => {
  let warn: jest.SpyInstance
  let error: jest.SpyInstance

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    error = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => jest.restoreAllMocks())

  it('logs "password not set" at warn, not error, and still answers 401', () => {
    const res = makeRes()
    errorHandler(
      new ApiError(
        401,
        "Password not set. Please use 'Forgot Password' to set up your password.",
        { requiresPasswordSetup: true },
      ),
      makeReq(),
      res,
      jest.fn(),
    )

    expect(error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][1]).not.toHaveProperty('stack')
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, requiresPasswordSetup: true }),
    )
  })

  it('logs an unexpected failure at error with its stack and answers 500', () => {
    const res = makeRes()
    errorHandler(new Error('something broke'), makeReq(), res, jest.fn())

    expect(warn).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0][1]).toHaveProperty('stack')
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
