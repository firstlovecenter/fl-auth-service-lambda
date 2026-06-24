import { Request, Response } from 'express'
import { REFRESH_TOKEN_TTL_SECONDS } from './auth'

/**
 * Name of the httpOnly cookie that carries the long-lived refresh token.
 *
 * SYN-173: the refresh token used to be returned in the login response body
 * and stored in localStorage by the web client, where any XSS could read it
 * and mint access tokens indefinitely. It now lives ONLY in this httpOnly,
 * Secure cookie — page JavaScript can neither read it nor exfiltrate it.
 */
export const REFRESH_COOKIE_NAME = 'fl_refresh_token'

/** Cookie Max-Age, derived from the same TTL the refresh JWT is signed with. */
const REFRESH_COOKIE_MAX_AGE_MS = REFRESH_TOKEN_TTL_SECONDS * 1000

/**
 * The web app and this auth service are both served from *.firstlovecenter.com
 * in every deployed environment, so they share a registrable domain and a
 * SameSite=Strict cookie is still sent on the cross-subdomain refresh request
 * (app.firstlovecenter.com → auth.firstlovecenter.com is same-site). Strict is
 * therefore the production default — and our CSRF mitigation.
 *
 * The ONLY exception is local development: the Vite dev server runs on
 * http://localhost:3000 and talks to dev-auth.firstlovecenter.com, which IS
 * cross-site — a Strict/Lax cookie would be withheld. We relax to SameSite=None
 * exclusively for localhost origins (None requires Secure, which browsers
 * honour over http://localhost). Limiting None to localhost — rather than "any
 * non-FLC origin" — means a spoofed Origin header can never coax a None cookie
 * onto a real user (and CORS already refuses non-FLC origins in production).
 */
const isLocalhostOrigin = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1'

const sameSiteForOrigin = (origin?: string): 'strict' | 'none' => {
  if (!origin) return 'strict'
  try {
    const { hostname } = new URL(origin)
    return isLocalhostOrigin(hostname) ? 'none' : 'strict'
  } catch {
    return 'strict'
  }
}

/**
 * Attributes shared by set + clear. They MUST match (path, sameSite, secure)
 * or the browser will not drop the cookie on clear.
 */
const baseCookieOptions = (req: Request) => ({
  httpOnly: true,
  secure: true,
  sameSite: sameSiteForOrigin(req.headers.origin),
  path: '/auth',
})

export const setRefreshCookie = (
  req: Request,
  res: Response,
  token: string,
): void => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseCookieOptions(req),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  })
}

export const clearRefreshCookie = (req: Request, res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions(req))
}

/**
 * Read the refresh token from the request Cookie header. Parsed by hand so we
 * don't have to add cookie-parser — express's res.cookie() (used above for
 * writing) works without it; only reading needs this.
 */
export const readRefreshCookie = (req: Request): string | null => {
  const header = req.headers.cookie
  if (!header) return null

  const prefix = `${REFRESH_COOKIE_NAME}=`
  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))

  if (!match) return null

  const value = match.slice(prefix.length)
  return value ? decodeURIComponent(value) : null
}
