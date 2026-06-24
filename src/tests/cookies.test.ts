/**
 * Unit tests for the refresh-token cookie helpers (SYN-173).
 *
 * Pure logic — no Neo4j required. Covers the security-critical bits:
 *   - the httpOnly/Secure/SameSite attributes the cookie is set with
 *   - the same-site (prod) vs cross-site (localhost dev) SameSite decision
 *   - parsing the token back out of the Cookie header
 */

import type { Request, Response } from 'express'
import {
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from '../utils/cookies'

const makeReq = (origin?: string, cookie?: string): Request =>
  ({ headers: { origin, cookie } } as unknown as Request)

const makeRes = () => {
  const cookie = jest.fn()
  const clearCookie = jest.fn()
  return {
    res: { cookie, clearCookie } as unknown as Response,
    cookie,
    clearCookie,
  }
}

describe('cookies — setRefreshCookie', () => {
  test('sets an httpOnly, Secure, path-scoped cookie with the refresh token', () => {
    const { res, cookie } = makeRes()
    setRefreshCookie(makeReq('https://app.firstlovecenter.com'), res, 'rt-123')

    expect(cookie).toHaveBeenCalledTimes(1)
    const [name, value, options] = cookie.mock.calls[0]
    expect(name).toBe(REFRESH_COOKIE_NAME)
    expect(value).toBe('rt-123')
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      path: '/auth',
    })
    expect(options.maxAge).toBeGreaterThan(0)
  })

  test('SameSite=Strict for a *.firstlovecenter.com origin (same-site prod)', () => {
    const { res, cookie } = makeRes()
    setRefreshCookie(makeReq('https://portal.firstlovecenter.com'), res, 'rt')
    expect(cookie.mock.calls[0][2].sameSite).toBe('strict')
  })

  test('SameSite=Strict for the bare firstlovecenter.com origin', () => {
    const { res, cookie } = makeRes()
    setRefreshCookie(makeReq('https://firstlovecenter.com'), res, 'rt')
    expect(cookie.mock.calls[0][2].sameSite).toBe('strict')
  })

  test('SameSite=None for a localhost origin (cross-site dev)', () => {
    const { res, cookie } = makeRes()
    setRefreshCookie(makeReq('http://localhost:3000'), res, 'rt')
    expect(cookie.mock.calls[0][2].sameSite).toBe('none')
  })

  test('SameSite=None for a 127.0.0.1 origin (cross-site dev)', () => {
    const { res, cookie } = makeRes()
    setRefreshCookie(makeReq('http://127.0.0.1:3000'), res, 'rt')
    expect(cookie.mock.calls[0][2].sameSite).toBe('none')
  })

  test('SameSite=Strict (never None) for a spoofed/arbitrary non-localhost origin', () => {
    // Only localhost may downgrade to None — a spoofed Origin header must not.
    const { res, cookie } = makeRes()
    setRefreshCookie(makeReq('https://evil.example'), res, 'rt')
    expect(cookie.mock.calls[0][2].sameSite).toBe('strict')
  })

  test('SameSite=Strict for a lookalike firstlovecenter domain', () => {
    const { res, cookie } = makeRes()
    setRefreshCookie(makeReq('https://firstlovecenter.com.evil.example'), res, 'rt')
    expect(cookie.mock.calls[0][2].sameSite).toBe('strict')
  })

  test('defaults to Strict when there is no Origin header', () => {
    const { res, cookie } = makeRes()
    setRefreshCookie(makeReq(undefined), res, 'rt')
    expect(cookie.mock.calls[0][2].sameSite).toBe('strict')
  })
})

describe('cookies — clearRefreshCookie', () => {
  test('clears with matching httpOnly/Secure/path attributes', () => {
    const { res, clearCookie } = makeRes()
    clearRefreshCookie(makeReq('https://app.firstlovecenter.com'), res)

    expect(clearCookie).toHaveBeenCalledTimes(1)
    const [name, options] = clearCookie.mock.calls[0]
    expect(name).toBe(REFRESH_COOKIE_NAME)
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      path: '/auth',
      sameSite: 'strict',
    })
  })
})

describe('cookies — readRefreshCookie', () => {
  test('returns null when there is no Cookie header', () => {
    expect(readRefreshCookie(makeReq())).toBeNull()
  })

  test('extracts the token when it is the only cookie', () => {
    expect(readRefreshCookie(makeReq(undefined, `${REFRESH_COOKIE_NAME}=abc.def.ghi`))).toBe(
      'abc.def.ghi',
    )
  })

  test('extracts the token from among several cookies', () => {
    const header = `theme=dark; ${REFRESH_COOKIE_NAME}=tok-456; other=1`
    expect(readRefreshCookie(makeReq(undefined, header))).toBe('tok-456')
  })

  test('url-decodes the cookie value', () => {
    expect(
      readRefreshCookie(makeReq(undefined, `${REFRESH_COOKIE_NAME}=a%20b`)),
    ).toBe('a b')
  })

  test('does not match a cookie whose name merely ends with the key', () => {
    expect(
      readRefreshCookie(makeReq(undefined, `not_fl_refresh_token=nope`)),
    ).toBeNull()
  })

  test('returns null when the cookie is present but empty', () => {
    expect(readRefreshCookie(makeReq(undefined, `${REFRESH_COOKIE_NAME}=`))).toBeNull()
  })
})
