# Authentication Security Principles — Codebase Mapping

> Map of every security principle to its concrete implementation in the Kolo Kept codebase.
> Lines reference the latest source. Component/page files are omitted where the principle is purely server-side.

---

## 1. Least Privilege

**Definition:** Every component, function, and process operates with only the minimum permissions needed to perform its function — no more.

| Where | What |
|---|---|
| `src/lib/auth.ts:113-115` | `verifySession()` selects only `id`, `name`, `email`, `accountLockedUntil` from the user — never `passwordHash`, `passwordResetToken`, or `failedLoginAttempts` |
| `src/actions/savings.ts:80-84` | `deleteSavingsAction` scopes the `DELETE` query to `{ id, userId: user.id }` — users can only delete their **own** entries |
| `src/actions/savings.ts:44` | `createSavingsAction` hardcodes `userId: user.id` into the created entry — no ability to write another user's data |
| `src/app/dashboard/page.tsx:28` | Dashboard queries only `where: { userId: user.id }` — a user sees only their own savings |
| `src/app/settings/page.tsx:33` | Settings page queries sessions scoped to `where: { userId: user.id }` — users see only their own sessions |
| `src/middleware.ts:30-33` | CSP restricts script sources to `'self'` + nonce, style to `'self'` + `'unsafe-inline'`, frames to `'none'`, objects to `'none'` |
| `prisma/schema.prisma:25-33` | `Session` model stores only a **hashed** token — the raw token is never persisted |
| `prisma/schema.prisma:45-54` | `SecurityLog` stores `userId` as nullable — logs for unauthenticated events (failed login to unknown email) store only the email, not a user reference |

---

## 2. Defense in Depth

**Definition:** Multiple independent security layers are stacked so that if one layer fails, another still blocks the attack.

| Where | What |
|---|---|
| `src/middleware.ts:8-13` | **Layer 1 — Route-level guard:** Checks for `session_token` cookie existence before allowing access to `/dashboard` or `/settings` |
| `src/actions/auth.ts:102-109` | **Layer 2 — Rate limiting:** Upstash Redis sliding-window limiter (5 req / 15 min) blocks brute-force before password check runs |
| `src/actions/auth.ts:112-117` | **Layer 3 — Input validation:** Zod schema validates email format and password presence before any DB query |
| `src/actions/auth.ts:130` | **Layer 4 — Timing-attack mitigation:** Dummy bcrypt comparison when user is not found |
| `src/actions/auth.ts:146-160` | **Layer 5 — Account lockout:** Rejects login if `accountLockedUntil > now()` |
| `src/actions/auth.ts:163-192` | **Layer 6 — Password verification:** Cost-14 bcrypt comparison |
| `src/actions/savings.ts:20-23` | **Layer 7 — Action-level auth:** Every business-logic action calls `verifySession()` independently |
| `src/middleware.ts:30-40` | **Layer 8 — HTTP security headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CSP, `Referrer-Policy`, `Permissions-Policy` |
| `src/lib/auth.ts:177-183` | **Layer 9 — Secure cookie flags:** `httpOnly: true`, `secure` in production, `sameSite: "lax"` |
| Next.js runtime | **Layer 10 — Origin-Host CSRF check:** Every Server Action validates `Origin === Host` before the handler runs |

---

## 3. Fail Securely

**Definition:** When a system component fails, the system does not default to a permissive or unsafe state — it defaults to denial.

| Where | What |
|---|---|
| `src/lib/rate-limit.ts:65-74` | **Redis failure → fail closed.** If the rate-limiter request throws, the function returns `{ success: false }` with a 1-minute lockout — it does NOT allow the request through |
| `src/lib/auth.ts:123-125` | **Missing session → null.** If `session.findUnique` returns `null`, `verifySession()` returns `null` (unauthenticated), not an error or partial data |
| `src/lib/auth.ts:37-43` | **Missing password hash → dummy comparison.** If `hash` is null, code runs `bcrypt.compare(password, DUMMY_HASH)` then returns `false` — never leaks whether the user exists |
| `src/actions/auth.ts:129-143` | **Missing user at login → dummy hash.** Performs `verifyPassword(password, null)` then returns `"Invalid credentials."` — the caller cannot distinguish "user not found" from "wrong password" |
| `src/actions/auth.ts:320-334` | **Missing user at forgot password → dummy task.** Runs dummy verification then returns the generic success message — does not reveal whether the email is registered |
| `src/actions/auth.ts:404-408` | **Missing/expired reset token → dummy hash.** Runs dummy verification then returns `"Invalid or expired reset token."` |
| `src/lib/auth.ts:129-134, 139-144` | **Expired session or locked user → session deleted and null returned.** Failed cleanup is caught silently; the function still returns `null` |

---

## 4. Generic Errors

**Definition:** Error messages intentionally conceal system internals to prevent attacker enumeration or fingerprinting.

| Where | What |
|---|---|
| `src/lib/validation.ts:38` | Login schema masks email validation: `.email("Invalid credentials")` — same message whether email format is wrong, email is missing, or password is wrong |
| `src/actions/auth.ts:116` | Login validation failure returns `"Invalid credentials."` — does not say which field failed |
| `src/actions/auth.ts:142` | Login handler returns `"Invalid credentials."` for both "user not found" and "wrong password" cases |
| `src/actions/auth.ts:312-313` | Forgot password returns a generic message regardless of email existence: `"If an account is associated with this email, a secure password reset link has been sent."` |
| `src/actions/auth.ts:91-92` | Signup catch block returns `"An unexpected error occurred during signup."` — no internal error details leaked |
| `src/actions/auth.ts:219-220` | Login catch block returns `"An unexpected error occurred during login."` |
| `src/actions/auth.ts:367-368` | Forgot password catch block returns `"An unexpected error occurred."` |
| `src/actions/auth.ts:445-446` | Reset password catch block returns `"An unexpected error occurred during password reset."` |
| `src/actions/savings.ts:54-55` | Savings catch block returns `"Failed to save entry."` |
| `src/actions/savings.ts:94-95` | Delete catch block returns `"Failed to delete entry."` |

---

## 5. Secure Defaults

**Definition:** Default configuration choices favor security over convenience; unsafe options must be explicitly opted into.

| Where | What |
|---|---|
| `src/lib/auth.ts:6` | `BCRYPT_SALT_ROUNDS = 14` — bcrypt cost factor is 14 by default, far above minimum recommendations |
| `src/lib/auth.ts:7-8` | Session tokens live 7 days — bounded by default, no "remember forever" option |
| `src/lib/auth.ts:177-183` | Cookie defaults to `httpOnly: true`, `sameSite: "lax"`, `secure` only in production (correct — localhost can't use Secure) |
| `src/lib/validation.ts:12-20` | Password defaults to minimum 12 characters with uppercase, lowercase, digit, and special character requirements |
| `src/middleware.ts:30-33` | Security headers set on every response: `DENY` framing, `nosniff`, strict referrer policy, restricted permissions |
| `src/middleware.ts:37` | CSP production defaults to `default-src 'self'` — everything is blocked unless explicitly allowed |
| `src/lib/auth.ts:11` | Dummy hash pre-computed with cost 14 — any code path that hits it runs a full bcrypt comparison, keeping timing uniform |
| `src/lib/rate-limit.ts:17` | Login rate limiter defaults to 5 attempts per 15 minutes |
| `src/lib/rate-limit.ts:23` | Forgot-password rate limiter defaults to 3 attempts per 1 hour |
| `src/lib/auth.ts:50-51` | Token hashing defaults to SHA-256 — raw tokens are never stored in the database |
| `src/lib/auth.ts:57-58` | Random tokens use `crypto.randomBytes(32)` — 256 bits of entropy by default |
| `prisma/schema.prisma:16` | `failedLoginAttempts` defaults to `0` for new users |
| `.env.example:11` | Documentation instructs a minimum 32-character secret |
| `src/components/ThemeProvider.tsx:16` | UI defaults to `dark` theme, `enableSystem: false` — user must explicitly switch |

---

## 6. Separation of Concerns — Auth Logic vs. Business Logic

**Definition:** Authentication primitives are isolated from domain logic so that one can be reviewed, tested, and replaced independently of the other.

| Layer | File | Role |
|---|---|---|
| **Auth primitives** | `src/lib/auth.ts` | Password hashing/verification (`hashPassword`, `verifyPassword`), session CRUD (`createSession`, `verifySession`, `destroySession`, `destroyAllSessions`), token generation, timing-attack helper (`DUMMY_HASH`), request metadata extraction. **Zero business logic.** |
| **Auth server actions** | `src/actions/auth.ts` | Orchestrates the full auth workflows — signup, login, logout, logout-all, forgot-password, reset-password. Calls `src/lib/auth.ts` primitives. Calls `src/lib/validation.ts` for input schemas. Calls `src/lib/rate-limit.ts` for throttling. **All auth, zero savings logic.** |
| **Business server actions** | `src/actions/savings.ts` | Create and delete savings entries. Calls `verifySession()` from `auth.ts` for access control, then performs domain operations. **All business logic, zero auth implementation.** |
| **Input validation schemas** | `src/lib/validation.ts` | Zod schemas for every action. Auth schemas (`signupSchema`, `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema`) are in the same file as the business schema (`savingsEntrySchema`) but are independently defined and exported. |
| **Rate limiting** | `src/lib/rate-limit.ts` | Upstash Redis ratelimiter configuration and the `checkRateLimit` wrapper. Imported only by `src/actions/auth.ts`. **Zero awareness of sessions, users, or business data.** |
| **Route-level guard** | `src/middleware.ts` | Checks for session cookie existence before protected routes render. **One responsibility — redirect or pass.** Sets security headers. Does not read business data. |
| **Database client** | `src/lib/db.ts` | Singleton Prisma client. **No logic — just connection management.** |
| **Dashboard page** | `src/app/dashboard/page.tsx` | Calls `verifySession()` and then `db.savingsEntry.findMany(...)`. The page does not know how sessions work — it calls a function that returns a user or null. |
| **Settings page** | `src/app/settings/page.tsx` | Calls `verifySession()` and then `db.session.findMany(...)`. Sessions are queried directly here (for display only), but the auth lifecycle (creation, destruction) is still in `src/lib/auth.ts`. |
| **Seed script** | `prisma/seed.mjs` | Standalone script using bcrypt directly. Shares the `BCRYPT_SALT_ROUNDS = 14` convention but does not import `src/lib/auth.ts` — appropriate for a one-off CLI tool. |

### Dependency flow diagram

```
src/middleware.ts          (cookie existence check)
       │
src/actions/savings.ts     (business logic)
       │
       └── src/lib/auth.ts  ──→ src/lib/db.ts
       │    (verifySession)
       │
src/actions/auth.ts         (auth workflows)
       │
       ├── src/lib/auth.ts   (primitives)
       ├── src/lib/validation.ts  (Zod schemas)
       ├── src/lib/rate-limit.ts  (Upstash Redis)
       └── src/lib/db.ts     (Prisma)
```

The business layer (`savings.ts`) never imports from `validation.ts`, `rate-limit.ts`, or the password/session internals of `auth.ts`. It calls one function (`verifySession`) and gets a user — the rest is opaque.
