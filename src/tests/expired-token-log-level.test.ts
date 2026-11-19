/**
 * Unit tests for how an expired / invalid token is logged (SYN-261).
 *
 * Pure logic — no Neo4j/AWS required (the secrets module is mocked). An expired
 * setup link or refresh cookie is the caller's to fix and is answered with a
 * 401, so it must log at WARN and stop raising error tickets. A real failure
 * (the signing secret failing to load) must still log at ERROR.
 */

import jwt from 'jsonwebtoken'

const mockGetSecret = jest.fn(async (key: string) => {
  if (key === 'JWT_SECRET') return 'unit-test-secret'
  throw new Error(`Secret not found: ${key}`)
})

jest.mock('../utils/secrets', () => ({
  getSecret: (key: string) => mockGetSecret(key),
  loadSecrets: jest.fn(async () => ({ JWT_SECRET: 'unit-test-secret' })),
}))

// eslint-disable-next-line import/first
import { verifyJWT, isExpectedTokenRejection } from '../utils/auth'
// eslint-disable-next-line import/first
import { logLevelForError } from '../middleware/errorHandler'

const loggedEntries = (spy: jest.SpyInstance) =>
  spy.mock.calls
    .map(([line]) => {
      try {
        return JSON.parse(String(line))
      } catch {
        return undefined
      }
    })
    .filter((entry) => entry?.message === 'JWT verification error (raw)')

describe('verifyJWT — log level for rejected tokens (SYN-261)', () => {
  let log: jest.SpyInstance

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => jest.restoreAllMocks())

  it('logs an expired token at WARN and still rejects it', async () => {
    const expired = jwt.sign(
      { userId: 'u1', exp: Math.floor(Date.now() / 1000) - 60 },
      'unit-test-secret',
      { algorithm: 'HS256' },
    )

    await expect(verifyJWT(expired)).rejects.toThrow('Invalid or expired token')

    const [entry] = loggedEntries(log)
    expect(entry.errorName).toBe('TokenExpiredError')
    expect(entry.level).toBe('WARN')
  })

  it('logs a token signed with the wrong secret at WARN', async () => {
    const forged = jwt.sign({ userId: 'u1' }, 'another-secret')

    await expect(verifyJWT(forged)).rejects.toThrow('Invalid or expired token')
    expect(loggedEntries(log)[0].level).toBe('WARN')
  })

  it('keeps a secret-loading failure at ERROR', async () => {
    mockGetSecret.mockRejectedValueOnce(new Error('AccessDeniedException'))

    // A fresh module copy, so the secret cached by the other tests is not reused.
    let isolatedVerify!: typeof verifyJWT
    jest.isolateModules(() => {
      isolatedVerify = require('../utils/auth').verifyJWT
    })

    await expect(isolatedVerify('anything')).rejects.toThrow()
    expect(loggedEntries(log)[0].level).toBe('ERROR')
  })

  it('never logs the token itself', async () => {
    const expired = jwt.sign(
      { userId: 'u1', exp: Math.floor(Date.now() / 1000) - 60 },
      'unit-test-secret',
    )
    await expect(verifyJWT(expired)).rejects.toThrow()

    const output = log.mock.calls.flat().join(' ')
    expect(output).not.toContain(expired)
  })
})

describe('isExpectedTokenRejection / logLevelForError (SYN-261)', () => {
  it.each(['TokenExpiredError', 'NotBeforeError', 'JsonWebTokenError'])(
    'treats %s as an expected rejection',
    (name) => {
      const error = new Error('rejected')
      error.name = name
      expect(isExpectedTokenRejection(error)).toBe(true)
      expect(logLevelForError(error)).toBe('warn')
    },
  )

  it('does not treat other errors as expected rejections', () => {
    expect(isExpectedTokenRejection(new Error('boom'))).toBe(false)
    expect(isExpectedTokenRejection('jwt expired')).toBe(false)
  })
})
