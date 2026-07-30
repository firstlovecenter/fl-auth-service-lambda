/**
 * Appends code + state to a redirect_uri via the URL API (not string
 * concatenation) so it's correct whether or not redirect_uri already has a
 * query string, and so code/state are always properly percent-encoded.
 */
export const buildRedirectUrl = (
  redirectUri: string,
  code: string,
  state: string,
): string => {
  const url = new URL(redirectUri)
  url.searchParams.set('code', code)
  url.searchParams.set('state', state)
  return url.toString()
}
