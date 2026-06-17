# CSRF Protection in Kolo Kept — Audit & Rationale

## Overview

This project originally implemented CSRF protection using `@edge-csrf/nextjs` v2.5.2 (double-submit cookie pattern with HMAC-salted tokens). A full audit revealed the library was **broken, deprecated, and conflicting with Next.js Server Actions**. This document covers the audit findings, why the library was removed, and how Next.js's built-in protection works.

---

## Part 1: Audit Findings

### 1. [CRITICAL] CSRF token never reaches server components

- `src/middleware.ts` → `csrfProtect(request, response)` sets `X-CSRF-Token` as a **response header**.
- `src/app/layout.tsx:23` → `headers().get("x-csrf-token")` reads **request headers**, not response headers.
- Result: `csrfToken` was always `""`, every `<input name="csrf_token">` rendered with `value=""`, CSRF always failed 403.

### 2. [CRITICAL] Request body consumed by middleware

- The library calls `request.formData()` inside the middleware to extract the CSRF token from POST bodies.
- This **consumes the request body stream** before Next.js Server Actions can read it.
- Even if Bug #1 were fixed, downstream Server Actions (`loginAction`, `signupAction`, etc.) would receive empty form data → validation fails with "Invalid credentials" because all fields are `undefined`.

### 3. [CRITICAL] `@edge-csrf/nextjs` is deprecated

- Package is officially marked deprecated on npm: *"Package no longer supported."*
- Last version published 8 months ago; removed by author.
- Known incompatibility with Next.js App Router Server Actions (see Bug #2).
- The underlying `edge-csrf` library (v1.0.11) is unmaintained.

### 4. [HIGH] Redundant — Next.js Server Actions have built-in CSRF

- Next.js 15 Server Actions validate `Origin` header against `Host` header out of the box.
- The manual double-submit cookie pattern added zero security while introducing a body-stream consumption bug and a token-inaccessibility bug.
- The middleware also blocked the request early (returning 403 for CSRF failure), preventing the built-in Server Action CSRF check from even running correctly.

### 5. [LOW] `sameSite: "lax"` on CSRF cookie

- `src/middleware.ts:11` → `sameSite: "lax"` allowed the cookie to be sent on top-level GET navigations from external sites.
- The library default is `"strict"` — the override offered no benefit and slightly reduced security.

---

## Part 2: How Next.js Server Actions Protect Against CSRF

### The mechanism

Every Server Action in Next.js is invoked via HTTP POST. When the request arrives, Next.js performs an **Origin-Host check** before your action code ever runs:

- Reads the `Origin` header from the incoming request
- Reads the `Host` header (or `X-Forwarded-Host` if behind a proxy)
- If `Origin !== Host`, the request is **rejected** with a 403

This is documented in the official Next.js Security Blog (October 2023):

> *"As an additional protection Server Actions in Next.js 14+ also compares the `Origin` header to the `Host` header (or `X-Forwarded-Host`). If they don't match, the Action will be rejected."*
>
> — https://nextjs.org/blog/security-nextjs-server-components-actions

And in the `next.config.js` docs for `serverActions`:

> *"Next.js compares the origin of a Server Action request with the host domain, ensuring they match to prevent CSRF attacks."*
>
> — https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions

### Why this works

CSRF is fundamentally a **cross-origin** attack. The attacker's page (`evil.example`) cannot set the `Origin` header on a request to `kolo-kept.example` — the browser sets it to `https://evil.example`, which will never match `kolo-kept.example`'s host. The request is rejected before it can do any damage.

### Comparison: Origin check vs. CSRF tokens

| Attack scenario | Next.js Origin check | CSRF token (double-submit cookie) |
|---|---|---|
| `evil.example` auto-submits form to `kolo-kept.example` | Blocked — `Origin: evil.example` ≠ `Host: kolo-kept.example` | Blocked — attacker doesn't know the token |
| Same-origin XSS on `kolo-kept.example` reads the token | Not protected (but CSRF is not the threat model here — you already lost) | Not protected — attacker reads the hidden input value |
| Malicious browser extension strips `Origin` header | Potentially bypassed | Still protects |
| Very old browser that doesn't send `Origin` (pre-2010, <1% globally) | Bypassed | Still protects |
| Legitimate reverse proxy where `Origin ≠ Host` | Bypassed — **mitigated by `serverActions.allowedOrigins`** | Still protects |

For the vast majority of real-world CSRF scenarios (cross-origin form submission from an attacker's page), the Origin check achieves the **same security goal** as a token — without the complexity, the body-consumption bug, or the maintenance burden of a deprecated library.

### What CSRF tokens do NOT protect against

- **Same-origin XSS** — if an attacker can inject script on `kolo-kept.example`, they can read the CSRF token from the DOM and include it in their forged request. CSRF tokens are not a defense against XSS.
- **Man-in-the-middle** — if an attacker controls the network, they see the token in plaintext. TLS is the defense here.

### The real defense layers for Server Action security

1. **Origin-Host check** (built into Next.js) — prevents cross-origin invocation
2. **`SameSite: Strict` on session cookie** — browser refuses to send the session cookie on cross-site requests
3. **Authentication check** inside every action (already done via `verifySession()`)
4. **Input validation** with Zod (already done in every action)
5. **Rate limiting** via Upstash (already done for login/forgot-password)

A manually-managed CSRF token provides no meaningful additional protection on top of these layers, and in this case it was actively breaking functionality.

### Configuring `allowedOrigins` for proxies

If you run behind a reverse proxy where `Origin` and `Host` legitimately differ, configure `serverActions.allowedOrigins` in `next.config.ts`:

```ts
// next.config.ts
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["my-proxy.com", "*.my-proxy.com"],
    },
  },
};
```

---

## Part 3: Remediation Applied

- Removed `@edge-csrf/nextjs` and `edge-csrf` from `package.json`
- Removed CSRF middleware from `src/middleware.ts`
- Deleted `src/components/CsrfProvider.tsx`
- Removed `<CsrfProvider>` wrapper from root layout
- Removed all `<input type="hidden" name="csrf_token">` from every form
- Removed all `useCsrfToken()` calls from client components
- Removed all `headers().get("x-csrf-token")` from server components

---

## References

- [Next.js Security Blog: How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions)
- [Next.js Docs: serverActions configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
- [OWASP: Cross-Site Request Forgery](https://owasp.org/www-community/attacks/csrf)
- [MDN: Origin header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin)
- [MDN: SameSite cookies explained](https://web.dev/articles/samesite-cookies-explained)
