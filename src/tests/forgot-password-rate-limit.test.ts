/**
 * Regression: seven password emails reached one address in 100 seconds because
 * checkRateLimit had been stubbed to always allow. No database needed.
 */
import neo4j from 'neo4j-driver'
import { Request, Response } from 'express'

const run = jest.fn()
const close = jest.fn()
const sendPasswordSetupEmail = jest.fn().mockResolvedValue(true)

jest.mock('../db/neo4j', () => ({
  getSession: () => ({ run, close }),
}))
jest.mock('../utils/auth', () => ({
  signJWT: jest.fn().mockResolvedValue('reset-token'),
}))
jest.mock('../utils/notifications', () => ({
  sendPasswordSetupEmail: (...args: unknown[]) =>
    sendPasswordSetupEmail(...args),
}))

import {
  forgotPassword,
  MAX_RESET_EMAILS_PER_WINDOW,
} from '../routes/forgotPassword'
import { checkRateLimit } from '../utils/security'

const userWithCount = (resetCount: number) => ({
  records: [
    {
      get: (key: string) =>
        ({
          id: 'user-1',
          auth_id: null,
          firstName: 'Test',
          resetCount: neo4j.int(resetCount),
        })[key],
    },
  ],
})

const call = async (ip: string) => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
  await new Promise<void>((resolve, reject) => {
    res.json.mockImplementation(() => {
      resolve()
      return res
    })
    forgotPassword(
      {
        body: { email: 'member@example.com' },
        ip,
        headers: {},
      } as unknown as Request,
      res as unknown as Response,
      reject,
    )
  })
  return res
}

beforeEach(() => {
  run.mockReset()
  sendPasswordSetupEmail.mockClear()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('forgot password per-email limit', () => {
  it('emails up to the limit', async () => {
    run.mockResolvedValue(userWithCount(MAX_RESET_EMAILS_PER_WINDOW))
    const res = await call('10.0.0.1')
    expect(sendPasswordSetupEmail).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('sends nothing past the limit, with the same response', async () => {
    run.mockResolvedValue(userWithCount(MAX_RESET_EMAILS_PER_WINDOW + 1))
    const res = await call('10.0.0.2')
    expect(sendPasswordSetupEmail).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      message:
        'If an account exists with this email, you will receive a password reset link.',
    })
  })

  it('sends nothing for an unknown email', async () => {
    run.mockResolvedValue({ records: [] })
    const res = await call('10.0.0.3')
    expect(sendPasswordSetupEmail).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('stops reaching the database once an IP is over its limit', async () => {
    run.mockResolvedValue({ records: [] })
    for (let i = 0; i < 10; i += 1) await call('10.0.0.4')
    run.mockClear()
    await call('10.0.0.4')
    expect(run).not.toHaveBeenCalled()
  })
})

describe('checkRateLimit', () => {
  const config = { maxAttempts: 2, windowMs: 1000, blockDurationMs: 5000 }

  afterEach(() => jest.restoreAllMocks())

  it('blocks past the limit, then allows again after the block', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    expect(checkRateLimit('k1', config).allowed).toBe(true)
    expect(checkRateLimit('k1', config).allowed).toBe(true)
    expect(checkRateLimit('k1', config)).toEqual({
      allowed: false,
      retryAfter: 5,
    })
    now.mockReturnValue(1_004_000)
    expect(checkRateLimit('k1', config).allowed).toBe(false)
    now.mockReturnValue(1_005_001)
    expect(checkRateLimit('k1', config).allowed).toBe(true)
  })

  it('starts a new window once the old one expires', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(2_000_000)
    checkRateLimit('k2', config)
    checkRateLimit('k2', config)
    now.mockReturnValue(2_001_000)
    expect(checkRateLimit('k2', config).allowed).toBe(true)
    expect(checkRateLimit('k2', config).allowed).toBe(true)
  })
})
