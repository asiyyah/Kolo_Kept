# Learnings — Bugs Found & Fixes Applied

## 1. CSRF Token Never Reached Server Components

**Symptom:** Every form submission returned 403 "CSRF validation failed". Hidden `<input name="csrf_token">` always rendered with `value=""`.

**Root cause:** `middleware.ts` set `X-CSRF-Token` as a **response header** via `response.headers.set()`. But `layout.tsx` read it from `headers().get("x-csrf-token")` which returns **request headers**, not response headers. Response headers set by middleware are invisible to server components.

**Fix:** Removed the entire `@edge-csrf/nextjs` library. Next.js Server Actions have built-in CSRF protection via Origin/Host header comparison.

---

## 2. Request Body Consumed by Middleware

**Symptom:** Even if the CSRF token were available, Server Actions received empty form data — all fields (`email`, `password`, etc.) were `undefined`.

**Root cause:** The `@edge-csrf/nextjs` library called `request.formData()` inside the middleware to extract the CSRF token. This consumed the request body stream. When Next.js routed the request to the Server Action, the body was already drained, so `formData.entries()` returned nothing.

**Fix:** Removed the library. No more body consumption in middleware.

---

## 3. `@edge-csrf/nextjs` Was Deprecated

**Symptom:** The npm package was officially marked deprecated with message "Package no longer supported." The author removed it.

**Root cause:** The package was abandoned. It had known incompatibilities with Next.js App Router Server Actions (body consumption bug above).

**Fix:** Uninstalled `@edge-csrf/nextjs` and `edge-csrf` from dependencies.

---

## 4. Redundant CSRF — Next.js Already Protects Server Actions

**Symptom:** The app was running a custom double-submit-cookie CSRF pattern alongside Next.js's built-in protection.

**Root cause:** Next.js 15 Server Actions compare `Origin` vs `Host` headers on every POST request. A cross-origin attacker can't forge a matching `Origin` header. The manual HMAC-token pattern added zero incremental security while introducing two critical bugs.

**Fix:** Removed the manual CSRF layer. Next.js's built-in Origin check is sufficient.

---

## 5. `PrismaClient` Constructor Required Options in Prisma 7

**Symptom:** `npm run seed` crashed with:
```
PrismaClientInitializationError: PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions
```

**Root cause:** `prisma/seed.js` used `new PrismaClient()` with no arguments. Prisma 7 requires either `adapter` (for driver adapters) or `accelerateUrl`. The old pattern of calling the constructor empty worked in Prisma 5/6 but was removed.

**Fix:** Updated `prisma/seed.js` to use the same adapter setup as `src/lib/db.ts`:
```js
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

---

## 6. `dangerouslySetInnerHTML` Script Tag in Login Page

**Symptom:** Login page used a raw `<script>` tag with `dangerouslySetInnerHTML` to redirect after successful login. This bypassed React's lifecycle and was flagged by security linting.

**Root cause:** The redirect was injected as raw JS into the DOM instead of using React's routing.

**Fix:** Replaced with `useEffect` + `useRouter().push()`:
```tsx
useEffect(() => {
  if (state.success) {
    const timeout = setTimeout(() => router.push("/dashboard"), 1000);
    return () => clearTimeout(timeout);
  }
}, [state.success, router]);
```

---

## Files Changed

| File | Change |
|---|---|
| `prisma/seed.js` | Added `PrismaPg` adapter + `Pool` to `PrismaClient` constructor |
| `package.json` | Removed `@edge-csrf/nextjs` and `edge-csrf` |
| `src/middleware.ts` | Stripped all CSRF imports, init, and validation; kept auth guard + security headers |
| `src/components/CsrfProvider.tsx` | Deleted |
| `src/app/layout.tsx` | Removed `headers` import, `CsrfProvider` wrapper, made synchronous |
| `src/app/login/page.tsx` | Removed `useCsrfToken`, hidden input, script tag; added `useEffect` redirect |
| `src/app/signup/page.tsx` | Removed `useCsrfToken` and hidden input |
| `src/app/forgot-password/page.tsx` | Removed `useCsrfToken` and hidden input |
| `src/app/reset-password/[token]/page.tsx` | Removed `useCsrfToken` and hidden input |
| `src/app/dashboard/page.tsx` | Removed `headers` import and hidden input |
| `src/app/settings/page.tsx` | Removed `headers` import and both hidden inputs |
| `src/components/LoginForm.tsx` | Removed `useCsrfToken` and hidden input |
| `src/components/SavingsForm.tsx` | Removed `useCsrfToken` and hidden input |
| `src/components/DeleteSavingsButton.tsx` | Removed `useCsrfToken` and hidden input |
