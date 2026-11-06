/**
 * Minimal, dependency-free hosted login page for external SSO (SSO_SPEC 3.2).
 * Plain server-rendered HTML + vanilla JS — no template engine, consistent
 * with the rest of this zero-frontend-framework service and fast to cold-start.
 *
 * Two DISTINCT escaping needs here, easy to conflate and get wrong:
 *  - values shown as HTML text (clientName, error) -> escapeHtml()
 *  - values embedded into the inline <script> as JS string literals
 *    (clientId, redirectUri, state) -> jsonForScript(), which also guards
 *    against a `</script>` breakout (a real reflected-XSS vector since these
 *    values come from the request's query params / hidden form fields).
 */

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })

/** JSON-encode for safe embedding inside an inline <script> block. */
const jsonForScript = (value: string): string =>
  JSON.stringify(value).replace(/</g, '\\u003c')

const PAGE_STYLES = `
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); padding: 2rem; width: 100%; max-width: 360px; }
  h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
  p.subtitle { color: #666; margin: 0 0 1.5rem; font-size: 0.9rem; }
  label { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; color: #333; }
  input { width: 100%; box-sizing: border-box; padding: 0.6rem 0.75rem; margin-bottom: 1rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; }
  button { width: 100%; padding: 0.7rem; border: none; border-radius: 8px; background: #111; color: #fff; font-size: 1rem; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  .error { color: #c0392b; font-size: 0.85rem; margin: 0 0 1rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b0b0c; }
    .card { background: #1c1c1e; box-shadow: none; }
    h1 { color: #fff; }
    p.subtitle { color: #999; }
    label { color: #ccc; }
    input { background: #2c2c2e; border-color: #444; color: #fff; }
  }
`

interface LoginPageParams {
  clientName: string
  clientId: string
  redirectUri: string
  state: string
  error?: string
}

export const renderLoginPage = ({
  clientName,
  clientId,
  redirectUri,
  state,
  error,
}: LoginPageParams): string => {
  const errorHtml = error
    ? `<p class="error">${escapeHtml(error)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in to First Love Center</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <h1>Sign in to First Love Center</h1>
    <p class="subtitle">${escapeHtml(clientName)} wants you to sign in with your FLC account.</p>
    ${errorHtml}
    <form id="login-form">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="username" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" />
      <button type="submit">Sign in</button>
    </form>
  </div>
  <script>
    (function () {
      var CLIENT_ID = ${jsonForScript(clientId)};
      var REDIRECT_URI = ${jsonForScript(redirectUri)};
      var STATE = ${jsonForScript(state)};
      var form = document.getElementById('login-form');

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var button = form.querySelector('button');
        button.disabled = true;

        // Relative, not absolute — this page can be served behind a stage
        // prefix (serverless-offline's /dev/..., or an API Gateway base path
        // mapping) that isn't known at render time. A relative path inherits
        // whatever prefix the current page was actually loaded under.
        fetch('authorize/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            state: STATE,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
          })
        })
          .then(function (res) {
            return res.json().then(function (body) { return { ok: res.ok, body: body }; });
          })
          .then(function (result) {
            if (result.ok && result.body.redirectUrl) {
              window.location.href = result.body.redirectUrl;
              return;
            }
            var params = new URLSearchParams({
              client_id: CLIENT_ID,
              redirect_uri: REDIRECT_URI,
              state: STATE,
              response_type: 'code',
              error: (result.body && result.body.error) || 'Sign in failed'
            });
            window.location.href = 'authorize?' + params.toString();
          })
          .catch(function () {
            button.disabled = false;
          });
      });
    })();
  </script>
</body>
</html>`
}

export const renderErrorPage = (title: string, message: string): string =>
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(message)}</p>
  </div>
</body>
</html>`
