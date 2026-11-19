/**
 * SYN-256: an environment without the EXT_RS256_* keys (external SSO not
 * seeded yet) must answer cleanly — an empty JWKS and a 503 from the
 * external authorize/token routes — and never log at ERROR, so a scanner hit
 * on /.well-known/jwks.json does not file a ticket.
 *
 * Pure logic — no Neo4j/AWS required (secrets, DB and rate limiter mocked).
 */

import crypto from 'crypto'
import type { Request, Response } from 'express'

const mockSecrets: Record<string, string | undefined> = {}

jest.mock('../utils/secrets', () => ({
  loadSecrets: jest.fn(async () => mockSecrets),
}))

const mockRateLimit = jest.fn(async () => ({ allowed: true }))
jest.mock('../utils/rateLimiter', () => ({
  checkExternalRateLimit: mockRateLimit,
}))

const mockGetActiveClient = jest.fn()
jest.mock('../utils/externalClients', () => ({
  getActiveClient: mockGetActiveClient,
  verifyClientSecret: jest.fn(),
  isRedirectUriRegistered: jest.fn(),
}))

jest.mock('../db/neo4j', () => ({
  getSession: jest.fn(() => {
    throw new Error('the DB must not be touched when SSO is unconfigured')
  }),
}))

// eslint-disable-next-line import/first
import {
  getJWKS,
  signExternalJWT,
  isExternalSigningConfigured,
  ExternalKeysNotConfiguredError,
} from '../utils/externalAuth'
// eslint-disable-next-line import/first
import { jwks } from '../routes/jwks'
// eslint-disable-next-line import/first
import { externalToken } from '../routes/external/token'
// eslint-disable-next-line import/first
import { authorizeGet } from '../routes/external/authorize'
// eslint-disable-next-line import/first
import { authorizeSubmit } from '../routes/external/authorizeSubmit'

interface CapturedResponse {
  status?: number
  body?: unknown
  headers: Record<string, string>
}

const invoke = async (
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => void,
  req: Partial<Request>,
): Promise<{ captured: CapturedResponse; nextError: unknown }> => {
  const captured: CapturedResponse = { headers: {} }
  let nextError: unknown
  await new Promise<void>((resolve) => {
    const res = {
      set: (name: string, value: string) => {
        captured.headers[name] = value
        return res
      },
      status: (code: number) => {
        captured.status = code
        return res
      },
      json: (body: unknown) => {
        captured.body = body
        resolve()
        return res
      },
      send: (body: unknown) => {
        captured.body = body
        resolve()
        return res
      },
      redirect: () => {
        throw new Error('must not redirect')
      },
    }
    handler(
      { headers: {}, query: {}, body: {}, ...req } as Request,
      res as unknown as Response,
      (err?: unknown) => {
        nextError = err
        resolve()
      },
    )
  })
  return { captured, nextError }
}

describe('external SSO with no RS256 keys configured (SYN-256)', () => {
  let errorSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    for (const key of Object.keys(mockSecrets)) delete mockSecrets[key]
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRateLimit.mockClear()
    mockGetActiveClient.mockClear()
  })

  afterEach(() => {
    // The whole point of the ticket: nothing here may log at ERROR.
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('reports SSO as not configured instead of throwing', async () => {
    await expect(isExternalSigningConfigured()).resolves.toBe(false)
  })

  it('getJWKS() returns an empty key set', async () => {
    await expect(getJWKS()).resolves.toEqual({ keys: [] })
  })

  it('signExternalJWT() still refuses, with a recognisable error', async () => {
    await expect(signExternalJWT({ sub: 'user-1' }, '5m')).rejects.toBeInstanceOf(
      ExternalKeysNotConfiguredError,
    )
  })

  it('GET /.well-known/jwks.json serves 200 {"keys":[]}, uncached', async () => {
    const { captured, nextError } = await invoke(jwks, {
      path: '/.well-known/jwks.json',
    })
    expect(nextError).toBeUndefined()
    expect(captured.status).toBe(200)
    expect(captured.body).toEqual({ keys: [] })
    expect(captured.headers['Cache-Control']).toBe('no-store')
  })

  it('POST /auth/external/token answers 503 before touching codes or the DB', async () => {
    const { captured, nextError } = await invoke(externalToken, {
      path: '/auth/external/token',
      body: {
        code: 'c',
        client_id: 'camp-app',
        client_secret: 's',
        redirect_uri: 'https://camp.example.com/callback',
      },
    })
    expect(nextError).toBeUndefined()
    expect(captured.status).toBe(503)
    expect(captured.body).toEqual({
      error: 'External sign-in is not available',
      statusCode: 503,
    })
    expect(mockRateLimit).not.toHaveBeenCalled()
    expect(mockGetActiveClient).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('GET /auth/external/authorize shows a 503 error page, never a redirect', async () => {
    const { captured, nextError } = await invoke(authorizeGet, {
      path: '/auth/external/authorize',
      query: {
        client_id: 'camp-app',
        redirect_uri: 'https://camp.example.com/callback',
        response_type: 'code',
      },
    })
    expect(nextError).toBeUndefined()
    expect(captured.status).toBe(503)
    expect(String(captured.body)).toContain('Sign-in unavailable')
    expect(mockGetActiveClient).not.toHaveBeenCalled()
  })

  it('POST /auth/external/authorize/submit answers 503 without checking credentials', async () => {
    const { captured, nextError } = await invoke(authorizeSubmit, {
      path: '/auth/external/authorize/submit',
      body: {
        client_id: 'camp-app',
        redirect_uri: 'https://camp.example.com/callback',
        email: 'someone@example.com',
        password: 'x',
      },
    })
    expect(nextError).toBeUndefined()
    expect(captured.status).toBe(503)
    expect(captured.body).toEqual({
      error: 'External sign-in is not available',
      statusCode: 503,
    })
    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it('picks the keys up once they are seeded (a miss is not cached)', async () => {
    await expect(getJWKS()).resolves.toEqual({ keys: [] })

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    mockSecrets.EXT_RS256_PRIVATE_KEY = privateKey
    mockSecrets.EXT_RS256_PUBLIC_KEY = publicKey
    mockSecrets.EXT_RS256_KID = 'flc-ext-seeded'

    await expect(isExternalSigningConfigured()).resolves.toBe(true)
    const document = await getJWKS()
    expect(document.keys).toHaveLength(1)
    expect(document.keys[0].kid).toBe('flc-ext-seeded')
  })
})
