/**
 * SYN-293 — "Could not perform discovery. No routing servers available".
 *
 * No Neo4j required: a local TCP server that drops every connection makes
 * the real driver raise the exact production error. session.run gives up
 * after one discovery attempt; a managed read (what /auth/login now uses)
 * retries it. When the database really is down, the error handler answers
 * 503 instead of 500.
 */

import net from 'net'
import type { Request, Response } from 'express'
import neo4j from 'neo4j-driver'
import { errorHandler, isDatabaseUnavailable } from '../middleware/errorHandler'

jest.mock('../db/neo4j', () => ({ getSession: jest.fn() }))

import { getSession } from '../db/neo4j'
import { login } from '../routes/login'

const makeRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.cookie = jest.fn().mockReturnValue(res)
  return res as Response & { status: jest.Mock; json: jest.Mock }
}

const makeReq = (body: unknown = {}) =>
  ({ id: 'req-1', path: '/auth/login', method: 'POST', body } as unknown as Request)

describe('Neo4j routing discovery failure', () => {
  let server: net.Server
  let port: number
  let connections: number

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = net.createServer((socket) => {
          connections += 1
          socket.destroy()
        })
        server.listen(0, '127.0.0.1', () => {
          port = (server.address() as net.AddressInfo).port
          resolve()
        })
      }),
  )

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  beforeEach(() => {
    connections = 0
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => jest.restoreAllMocks())

  const withDriver = async (fn: (driver: ReturnType<typeof neo4j.driver>) => Promise<void>) => {
    const driver = neo4j.driver(
      `neo4j://127.0.0.1:${port}`,
      neo4j.auth.basic('user', 'password'),
      { maxTransactionRetryTime: 1500 },
    )
    try {
      await fn(driver)
    } finally {
      await driver.close()
    }
  }

  const capture = async (p: Promise<unknown>) => {
    try {
      await p
    } catch (error) {
      return error as Error & { code?: string }
    }
    throw new Error('expected the query to fail')
  }

  it('session.run fails on the first discovery attempt with the production error', async () => {
    await withDriver(async (driver) => {
      const error = await capture(driver.session().run('RETURN 1'))
      expect(error.code).toBe('ServiceUnavailable')
      expect(error.message).toContain('No routing servers available')
      expect(connections).toBe(1)
    })
  })

  it('a managed read retries discovery instead of failing at once', async () => {
    await withDriver(async (driver) => {
      const error = await capture(
        driver.session().executeRead((tx) => tx.run('RETURN 1')),
      )
      expect(error.code).toBe('ServiceUnavailable')
      expect(connections).toBeGreaterThan(1)
    })
  })

  it('answers 503, not 500, when the database stays unreachable', async () => {
    await withDriver(async (driver) => {
      const error = await capture(driver.session().run('RETURN 1'))
      expect(isDatabaseUnavailable(error)).toBe(true)

      const res = makeRes()
      errorHandler(error, makeReq(), res, jest.fn())
      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Database service temporarily unavailable',
        }),
      )
      // A real outage is still a real failure — it stays at ERROR.
      expect(console.error).toHaveBeenCalled()
    })
  })

  it('does not treat other errors as an outage', () => {
    expect(isDatabaseUnavailable(new Error('something broke'))).toBe(false)
    expect(isDatabaseUnavailable('ServiceUnavailable')).toBe(false)
  })
})

describe('POST /auth/login', () => {
  it('reads the member through a managed read transaction, not session.run', async () => {
    const tx = { run: jest.fn().mockResolvedValue({ records: [] }) }
    const session = {
      run: jest.fn().mockRejectedValue(new Error('session.run must not be used')),
      executeRead: jest.fn((work: (t: typeof tx) => unknown) => work(tx)),
      close: jest.fn().mockResolvedValue(undefined),
    }
    ;(getSession as jest.Mock).mockReturnValue(session)

    const next = jest.fn()
    login(
      makeReq({ email: 'nobody@example.com', password: 'secret' }),
      makeRes(),
      next,
    )
    await new Promise((resolve) => setImmediate(resolve))

    expect(session.executeRead).toHaveBeenCalledTimes(1)
    expect(tx.run).toHaveBeenCalledTimes(1)
    expect(session.run).not.toHaveBeenCalled()
    expect(session.close).toHaveBeenCalled()
    // No member found → the usual 401 refusal, passed to the error handler.
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    )
  })
})
