# CSRF Audit Report — Kolo Kept

## Overview

The app uses `@edge-csrf/nextjs` v2.5.2 (double-submit cookie pattern) for CSRF protection. After full audit, CSRF validation **cannot pass** due to a fundamental wiring bug, and the library is conflicting with Next.js Server Actions.

---

## Findings

### 1. [CRITICAL] CSRF token never reaches server components

- `middleware.ts` → `csrfProtect(request, response)` sets `X-CSRF-Token` as a **response header**.
- `layout.tsx:23` → `headers().get("x-csrf-token")` reads **request headers**, not response headers.
- Result: `csrfToken` is always `""`, every `<input name="csrf_token">` renders with `value=""`, CSRF always fails 403.

### 2. [CRITICAL] Request body consumed by middleware

- The library calls `request.formData()` inside the middleware to extract the CSRF token from POST bodies.
- This **consumes the request body stream** before Next.js Server Actions can read it.
- Even if Bug #1 were fixed, the downstream Server Action (`loginAction`, `signupAction`, etc.) would receive empty form data → validation fails with "Invalid credentials" because all fields are `undefined`.

### 3. [CRITICAL] `@edge-csrf/nextjs` is deprecated

- Package is officially marked deprecated on npm: *"Package no longer supported."*
- Last version published 8 months ago; removed by author.
- Known incompatibility with Next.js App Router Server Actions (see Bug #2).
- The underlying `edge-csrf` library (v1.0.11) is unmaintained.

### 4. [HIGH] Redundant — Next.js Server Actions have built-in CSRF

- Next.js 15 Server Actions validate `Origin` and `Referer` headers against `serverActions.allowedOrigins` out of the box.
- The manual double-submit cookie pattern adds zero security on top of that while introducing a body-stream consumption bug and a token-inaccessibility bug.
- `middleware.ts` also blocks the request early (returns 403 for CSRF failure), preventing the built-in Server Action CSRF check from even running correctly.

### 5. [LOW] `sameSite: "lax"` weakens CSRF cookie

- `src/middleware.ts:11` → `sameSite: "lax"` allows the cookie to be sent on top-level GET navigations from external sites.
- The library default is `"strict"` — the override offers no benefit and slightly reduces security.

---

## Recommended Fix

**Remove `@edge-csrf/nextjs` and `edge-csrf` entirely.** Stop manually managing CSRF tokens. Next.js 15 Server Actions already protect against CSRF via Origin/Referer checks.

### Steps (for implementation)

1. **Remove dependencies:**
   ```
   npm uninstall @edge-csrf/nextjs edge-csrf
   ```

2. **Remove all CSRF code from middleware** (`src/middleware.ts`):
   - Remove `import { createCsrfProtect, CsrfError } from "@edge-csrf/nextjs"`
   - Remove the `csrfProtect` initialization and the try/catch `csrfProtect(request, response)` block (lines 5-65)
   - Keep the security headers section (lines 67-81)

3. **Remove CsrfProvider** (`src/components/CsrfProvider.tsx`):
   - Delete the entire file

4. **Update root layout** (`src/app/layout.tsx`):
   - Remove `import { headers } from "next/headers"`
   - Remove `const headerList = await headers()` and `const csrfToken = ...`
   - Remove `<CsrfProvider>` wrapper

5. **Remove CSRF hidden inputs from all forms:**
   - `src/app/login/page.tsx:49` — remove `<input type="hidden" name="csrf_token" />`
   - `src/app/signup/page.tsx:70`
   - `src/app/forgot-password/page.tsx:54`
   - `src/app/reset-password/[token]/page.tsx:79`
   - `src/app/dashboard/page.tsx:69`
   - `src/app/settings/page.tsx:62,188`
   - `src/components/LoginForm.tsx:49`
   - `src/components/SavingsForm.tsx:42`
   - `src/components/DeleteSavingsButton.tsx:19`

6. **Remove `useCsrfToken` imports and calls** from all client components.

7. **Remove CSRF header reads from server components:**
   - `src/app/dashboard/page.tsx:23-24` — remove CSRF token retrieval
   - `src/app/settings/page.tsx:24-25` — remove CSRF token retrieval
   - Remove `import { headers } from "next/headers"` from these files

### What's left

- Next.js Server Action's built-in Origin/Referer CSRF check (enabled by default).
- The session cookie already has `sameSite: "lax"` — consider hardening it to `"strict"` after confirming it doesn't break UX flows.
- The auth guard in middleware (session check for protected routes) stays intact.

---

## Other notes from the investigation

- **Token mismatch observation:** The user noticed "the token being sent is different from what is being received." This is expected — the `X-CSRF-Token` is a salted SHA-1 HMAC of the CSRF secret, intentionally different from the cookie value. It was not a bug, just the cryptography working as designed.
- The session/auth code (`src/lib/auth.ts`) is well-written and does not need changes.
- Rate limiting (Upstash), password hashing (bcrypt cost 14), and security logging are all correctly implemented.
