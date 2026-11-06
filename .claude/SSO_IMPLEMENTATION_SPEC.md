# FLC Auth — External SSO Implementation Spec

**Purpose:** add an OAuth2 authorization-code flow to FLC auth so external church apps
(camp-app first) can authenticate users via FLC identity, without ever handling
passwords. Purely additive — the existing login flow, tokens, and sessions are untouched.

**Approved by team lead. Data exposed to external apps: `id`, `email`, `name` only —
NOT roles.**

---

## Architecture in one picture

```
Camp-app                    FLC Auth                      Camp-app backend
   │                           │                                │
   │ 1. redirect to authorize  │                                │
   │──────────────────────────>│                                │
   │                           │ 2. user logs in (EXISTING flow)│
   │                           │ 3. issue single-use code       │
   │ 4. redirect back w/ code  │                                │
   │<──────────────────────────│                                │
   │ 5. code ─────────────────────────────────────────────────>│
   │                           │ 6. POST /token (code+secret)   │
   │                           │<───────────────────────────────│
   │                           │ 7. RS256 JWT {id,email,name} ─>│
   │                           │                                │ 8. verify via JWKS
   │                           │                                │ 9. mint Firebase token
```

The external app never sees a password. It gets a signed assertion and trusts it.

---

## Build in 4 phases. Phases 1–2 are self-contained and testable in isolation — build
and prove them BEFORE the login frontend (Phase 3), which is the biggest chunk and
highest risk. If time runs out, a working token core beats a half-built login page.

---

# PHASE 1 — Crypto foundation (RS256 + JWKS)

**Goal:** FLC can sign tokens with a private key; anyone can verify with a public key.

## 1.1 Generate the RS256 key pair
- Generate a 2048-bit (or 4096) RSA key pair.
- **Private key** → AWS Secrets Manager (same store as the existing HS256 secret).
  Never in the repo, never in env files committed to git.
- **Public key** → served via JWKS (below). Safe to be public.
- Give the key a **`kid`** (key id, e.g. `flc-ext-2026-01`) so keys can be rotated
  later without breaking verification.

## 1.2 `GET /.well-known/jwks.json`
- Public, unauthenticated endpoint.
- Returns the public key in JWKS format:
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "flc-ext-2026-01",
      "alg": "RS256",
      "n": "<base64url modulus>",
      "e": "AQAB"
    }
  ]
}
```
- Cache-friendly (set a sensible `Cache-Control`, e.g. 1 hour) — external verifiers
  fetch and cache this.

## 1.3 Prove it in isolation
- Write a script that signs a dummy JWT with the private key and verifies it by
  fetching the JWKS endpoint. **This must pass before moving on.** It proves the whole
  trust mechanism works end to end.

---

# PHASE 2 — Token issuance + client registry

**Goal:** exchange a valid code for a signed identity token, only for approved apps.

## 2.1 Client registry
A store (DB table) of approved external apps:
| field | notes |
|---|---|
| `client_id` | public identifier, e.g. `camp-app` |
| `client_secret_hash` | HASHED (bcrypt/argon2) — never store plaintext |
| `redirect_uris` | array of exact allowed callback URLs |
| `name` | display name (shown on consent screen) |
| `active` | enable/disable without deleting |

- Seed camp-app as the first client with its redirect URI(s).
- The client_secret is generated once, shown once, given to the camp-app team to store
  in ITS backend secrets. FLC only keeps the hash.

## 2.2 Authorization codes (the short-lived tickets)
A store for issued codes (DB table or short-TTL cache like Redis):
| field | notes |
|---|---|
| `code` | random, high-entropy (≥32 bytes) |
| `client_id` | which app requested it |
| `user_id` | which authenticated user it's for |
| `redirect_uri` | the one used in the authorize request (must match on exchange) |
| `expires_at` | **~60 seconds** from issue |
| `used` | boolean — codes are SINGLE-USE |

## 2.3 `POST /auth/external/token`
Request (server-to-server, from camp-app backend):
```json
{ "code": "...", "client_id": "camp-app", "client_secret": "...", "redirect_uri": "..." }
```
Validation (reject with clear errors on any failure):
1. `client_id` exists and is `active`.
2. `client_secret` matches the stored hash.
3. `code` exists, not expired, not already `used`.
4. The code's `client_id` matches the requesting client.
5. `redirect_uri` matches the one stored with the code.

On success:
- Mark the code `used` (immediately — single-use).
- Look up the user's `id`, `email`, `name`.
- Return an **RS256-signed JWT**:
```json
{
  "iss": "https://auth.firstlovecenter.com",   // FLC issuer
  "aud": "camp-app",                            // the requesting client_id
  "sub": "<stable-user-id>",                    // stable, never reused
  "email": "...",
  "name": "...",
  "iat": <now>,
  "exp": <now + 5min>                           // short — used once, immediately
}
```
- Header includes the `kid` from Phase 1.
- **Expose NOTHING else.** No roles, no org structure, no phone, no internal fields.

## 2.4 Prove it in isolation
- With a manually-inserted valid code, call `/token` and verify the returned JWT
  against the JWKS endpoint. Confirm all the rejection paths (bad secret, expired code,
  reused code, wrong redirect_uri) return errors, not tokens.

---

# PHASE 3 — Authorize flow + login frontend (biggest chunk)

**Goal:** the user-facing entry point. Authenticates via the EXISTING flow, then issues
a code. This needs a hosted login page — the service is currently API-only.

## 3.1 `GET /auth/external/authorize`
Query params from the external app:
- `client_id` — must be a registered, active client
- `redirect_uri` — must exactly match one registered for that client
- `state` — opaque value the app sends; returned unchanged (CSRF protection)
- `response_type=code`

Flow:
1. Validate `client_id` + `redirect_uri` BEFORE showing anything. If invalid, error page
   — do NOT redirect (an unvalidated redirect_uri is an open-redirect risk).
2. If the user has a valid existing FLC session → skip to step 4.
3. Otherwise → show the **login page** (3.2). On submit, authenticate via the EXISTING
   login logic (reuse it — do not reimplement auth).
4. (Optional but recommended) show a **consent screen**: "Camp App wants to access your
   name and email. Allow / Deny."
5. On success: generate a single-use code (Phase 2.2), redirect to:
   `{redirect_uri}?code={code}&state={state}`

## 3.2 The login frontend
- A hosted page on the auth service (it has none today — this is the main new build).
- Email + password form → posts to the existing auth logic.
- Handles: bad credentials, the consent step, and the redirect-back.
- Keep it minimal and on the auth service's own domain (credentials only ever entered
  on FLC's domain, never the external app's).
- CORS: the authorize/login pages are top-level navigations (not XHR from the app), so
  they don't need CORS entries. The `/token` endpoint is server-to-server, also no
  browser CORS. (Only add CORS allowlist entries if something genuinely calls from a
  browser on another origin.)

## 3.3 Security checklist for this phase
- `redirect_uri` validated against the registry BEFORE any redirect (open-redirect).
- `state` echoed back unchanged.
- Codes single-use, ~60s TTL.
- Existing login logic reused, not reimplemented.
- Rate-limit the authorize + login endpoints.

---

# PHASE 4 — Camp-app side (in the camp-app repo, not FLC auth)

**Goal:** complete the loop — exchange the code, verify the token, mint a Firebase session.

1. **"Sign in with FLC" button** → redirects browser to
   `{FLC}/auth/external/authorize?client_id=camp-app&redirect_uri={callback}&state={random}&response_type=code`.
   Store `state` (e.g. in a cookie/session) to check on return.
2. **Callback route** receives `?code=...&state=...`:
   - Verify `state` matches what was sent. Abort if not.
3. **Backend (Cloud Function)** exchanges the code:
   - `POST {FLC}/auth/external/token` with code + client_id + client_secret (secret from
     Firebase secrets, NEVER in the browser) + redirect_uri.
4. **Verify the returned JWT:**
   - Fetch FLC's JWKS (cache it), verify signature with the `kid`'s public key.
   - Check `iss` == FLC issuer, `aud` == `camp-app`, `exp` not passed.
5. **Mint a Firebase custom token** for the verified identity:
   ```js
   const uid = `flc:${payload.sub}`;   // namespaced, stable
   const firebaseToken = await admin.auth().createCustomToken(uid);
   ```
   Return to the browser → `signInWithCustomToken(firebaseToken)`.
6. **Roles:** after sign-in, camp-app reads its OWN Firestore assignments keyed to that
   uid. FLC provides identity only.

### ⚠️ Account-linking note
If a person already has a camp-app email/password account and later signs in via FLC,
both must resolve to the SAME uid, or they get a second empty account. Decide the linking
strategy (e.g. match on verified email and link) before rolling SSO out to existing users.

---

# Global security checklist (hold the line on all of these)
- [ ] Private key only in AWS Secrets Manager; public key only via JWKS.
- [ ] Authorization codes: high-entropy, single-use, ~60s TTL.
- [ ] `client_secret` stored hashed; only ever transmitted server-to-server.
- [ ] `redirect_uri` validated against the registry before ANY redirect.
- [ ] `state` param round-tripped for CSRF protection.
- [ ] External JWT exposes ONLY id/email/name — never roles or internal fields.
- [ ] Token endpoint + authorize/login endpoints rate-limited.
- [ ] Existing login flow reused, not reimplemented — and demonstrably unchanged.
- [ ] `kid` in token header + JWKS so keys can rotate later.

# What must NOT change (the reassurance to the team, made concrete)
- Existing login endpoint, its tokens (HS256), and existing sessions: untouched.
- The two existing apps: no changes required, keep working as-is.
- New RS256 key is SEPARATE, additional material — the HS256 secret is not replaced,
  shared, or exposed.
- Removing the three new endpoints would return the service to exactly today's behaviour.
