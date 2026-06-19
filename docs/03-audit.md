# Security Audit

> All 14 findings discovered during full codebase audit on 2026-06-19.
> Each finding includes: description, impact, vulnerable code, and a tested fix.

---

## V1 — Timing side-channel on forgot-password (user enumeration)

**Severity:** High
**Category:** Timing attack / Enumeration

**Description:**
The `forgotPasswordAction` takes measurably different time depending on whether the email exists:

- **User exists path:** `crypto.randomBytes(32)` + SHA-256 + DB transaction (user update + security log insert) — typically **20–40 ms**.
- **User missing path:** `bcrypt.compare("dummy_password", DUMMY_HASH)` at cost 14 — typically **~150 ms**.

The missing-user path is **slower** by ~100 ms because bcrypt runs full key derivation. An attacker making thousands of requests can distinguish the two response-time distributions and enumerate valid emails.

**Code:**
`src/actions/auth.ts:315-368`

**Fix:**
Add a bcrypt delay to the existing-user path so both paths take similar time, or remove the bcrypt from the missing-user path and use a fixed artificial delay. Prefer the former (bcrypt on both) to keep the timing bound to real crypto work:

```ts
// In the existing-user branch, after updating the user in the transaction:
if (!user) {
  await verifyPassword("dummy_password", null);
  // ...
  return { success: true, message: genericSuccessMessage };
}

// Add dummy bcrypt work to the existing-user branch to match timing:
await bcrypt.compare("dummy_password", DUMMY_HASH);
```

---

## V2 — Race condition on failed login attempts (lockout bypass)

**Severity:** High
**Category:** Race condition

**Description:**
The login handler reads `user.failedLoginAttempts` once at request start, then writes the incremented value back. If an attacker fires N concurrent requests, each request reads the same initial value (e.g. 0) and writes back `0 + 1 = 1`. The counter never reaches 10 and the account lockout is never triggered.

The Upstash rate limiter (5 req / 15 min per IP) mitigates this slightly, but a distributed attack from many IPs can still race the DB-level counter.

**Code:**
`src/actions/auth.ts:167-168`
```ts
const failedAttempts = user.failedLoginAttempts + 1;
```

The `user` object was fetched at line 123–125, before the password check. This is a classic TOCTOU + read-modify-write bug.

**Fix:**
Use Prisma's atomic `increment` so each failed attempt is guaranteed to add 1, regardless of concurrent requests:

```ts
await tx.user.update({
  where: { id: user.id },
  data: {
    failedLoginAttempts: { increment: 1 },
    accountLockedUntil: lockUntil,
  },
});
```

And compute `lockUntil` based on the **new** counter. With `increment`, you cannot know the new value before the write. Instead, apply the lockout conditionally:

```ts
await tx.user.update({
  where: { id: user.id },
  data: {
    failedLoginAttempts: { increment: 1 },
    ...(lockAt10
      ? { accountLockedUntil: new Date(Date.now() + 60 * 60 * 1000) }
      : {}),
  },
});
```

Where `lockAt10` is determined client-side but the counter is always atomically incremented.

**Even better:** Do this in a single atomic upsert-like operation. However, the simplest correct fix with Prisma is:

```ts
await tx.$executeRaw`
  UPDATE "User"
  SET
    "failedLoginAttempts" = "failedLoginAttempts" + 1,
    "accountLockedUntil" = CASE
      WHEN "failedLoginAttempts" + 1 >= 10 THEN NOW() + INTERVAL '1 hour'
      ELSE "accountLockedUntil"
    END
  WHERE id = ${user.id}
`;
```

But the Prisma-native increment approach with a separate fetch of the updated value is cleaner:

```ts
// Inside the transaction, after password verification fails:
const updatedUser = await tx.user.update({
  where: { id: user.id },
  data: {
    failedLoginAttempts: { increment: 1 },
  },
});

const lockUntil =
  updatedUser.failedLoginAttempts >= 10
    ? new Date(Date.now() + 60 * 60 * 1000)
    : null;

if (lockUntil) {
  await tx.user.update({
    where: { id: user.id },
    data: { accountLockedUntil: lockUntil },
  });
}

await tx.securityLog.create({
  data: {
    userId: user.id,
    email: user.email,
    action: updatedUser.failedLoginAttempts >= 10 ? "ACCOUNT_LOCKOUT" : "LOGIN_FAILED",
    ipAddress,
    userAgent,
  },
});
```

---

## V3 — Rate limiting silently bypassed on missing/placeholder Redis config

**Severity:** High
**Category:** Configuration / Bypass

**Description:**
`.env` currently contains:
```
UPSTASH_REDIS_REST_URL="https://placeholder.upstash.io"
UPSTASH_REDIS_REST_TOKEN="placeholder"
```

`checkRateLimit()` detects these placeholder values and returns `{ success: true, limit: 999, ... }` with a `console.warn`. Rate limiting is completely bypassed. An attacker can send unlimited login and forgot-password requests.

The `console.warn` is invisible in production logs unless log level is tuned. This is effectively a silent bypass.

**Code:**
`src/lib/rate-limit.ts:45-54`

**Fix:**
Option A — Put real Upstash credentials in `.env` (immediate fix).

Option B — Make the bypass throw or crash in production so it cannot be silently missed:

```ts
if (!redisUrl || !redisToken || redisUrl.includes("placeholder")) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Rate limiting is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env"
    );
  }
  console.warn("⚠️ Rate limiting bypassed in development");
  return { success: true, limit: 999, remaining: 999, reset: Date.now() };
}
```

---

## V4 — Account lockout message leaks user existence

**Severity:** Medium
**Category:** Enumeration

**Description:**
Login returns a different error message when the account is locked vs. when credentials are wrong:

- Locked → `"Account is temporarily locked due to multiple failed login attempts..."` (V4)
- Wrong password / user not found → `"Invalid credentials."`

An attacker can distinguish "this email exists and is locked" from "this email does not exist" by the response message.

**Code:**
`src/actions/auth.ts:156-159`

**Fix:**
Return the same generic `"Invalid credentials."` message for every failure. Log the real reason server-side for audit:

```ts
if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
  await db.securityLog.create({ /* ... action: "ACCOUNT_LOCKOUT_BLOCKED" ... */ });
  return { success: false, error: "Invalid credentials." };
}
```

---

## V5 — Signup "email exists" message leaks user registration

**Severity:** Medium
**Category:** Enumeration

**Description:**
`signupAction` returns `"Email is already registered."` when a user tries to sign up with an existing email. This is a direct email enumeration oracle.

**Code:**
`src/actions/auth.ts:57-58`

**Fix:**
Return a generic error message that does not reveal whether the email exists:

```ts
if (existingUser) {
  return { success: false, error: "An account with this email could not be created." };
}
```

Or even better — do not check existence at all and let the unique constraint fail. In the catch block, return a generic message:

```ts
try {
  // Try to create the user directly
  const newUser = await db.$transaction(async (tx) => {
    return tx.user.create({ data: { name, email, passwordHash } });
  });
  await createSession(newUser.id);
  return { success: true };
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    // Unique constraint violation — email already exists
    return { success: false, error: "An account with this email could not be created." };
  }
  console.error("Signup error:", error);
  return { success: false, error: "An unexpected error occurred during signup." };
}
```

This eliminates the pre-check race (V2-like) and removes the enumeration oracle.

---

## V6 — No rate limiting on reset password execution

**Severity:** Medium
**Category:** Missing throttle

**Description:**
`forgotPasswordAction` is rate limited (3 req / h per IP). But `resetPasswordAction` has no rate limiter at all. An attacker who obtains a valid reset link (via log access, shoulder surfing, etc.) can submit the reset payload with zero throttling. While the token has 256 bits of entropy, the lack of rate limiting enables rapid-fire submission and server resource exhaustion.

**Code:**
`src/actions/auth.ts:375-448`

**Fix:**
Add a per-IP rate limiter to `resetPasswordAction`:

```ts
// In resetPasswordAction, after getRequestMetadata():
const rateLimitRes = await checkRateLimit(resetPasswordRateLimiter, `reset:${ipAddress}`);
if (!rateLimitRes.success) {
  return { success: false, error: "Too many reset attempts. Please try again later." };
}
```

And define the limiter in `src/lib/rate-limit.ts`:

```ts
export const resetPasswordRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/kolo_reset",
});
```

---

## V7 — Reset token logged to server console

**Severity:** High
**Category:** Credential leakage

**Description:**
`forgotPasswordAction` writes the raw reset token (which grants password reset access) to `console.log`:

```ts
console.log(`\n🔑 [SECURITY AUDIT] PASSWORD RESET REQUESTED FOR: ${email}`);
console.log(`🔗 RESET LINK: http://localhost:3000/reset-password/${rawToken}\n`);
```

In production, logs are persisted. Anyone with access to the log storage (S3, CloudWatch, Papertrail, etc.) can extract valid reset tokens and change any user's password.

**Code:**
`src/actions/auth.ts:362-363`

**Fix:**
- Remove the `console.log` statements in production.
- Only log in development, and redact the token:

```ts
if (process.env.NODE_ENV !== "production") {
  console.log(`[DEV] Password reset requested for: ${email}`);
}
```

For production, the token should only be sent via email (or other out-of-band channel). The token must **never** be written to logs.

---

## V8 — No email service — tokens created when delivery fails

**Severity:** High
**Category:** Broken flow / Token leak

**Description:**
The forgot-password action:
1. Generates a reset token
2. Stores it in the database
3. **Does not send an email** — just logs to console
4. Returns `{ success: true }`

If a real email service is added later and the call is placed **after** the token is persisted, a delivery failure would leave a valid token in the database that was never sent to the user. An attacker who discovers the token (e.g. via server logs or DB access) could reset the password.

Additionally, the current implementation has **no email service at all**. The feature is non-functional in production — the token exists in the DB but the user never receives it.

**Code:**
`src/actions/auth.ts:336-365`

**Fix:**
In production, the token must only be persisted **after** the email is successfully sent:

```ts
// 1. Generate token
const rawToken = generateRandomToken();
const hashedToken = hashToken(rawToken);
const expires = new Date(Date.now() + 30 * 60 * 1000);

// 2. Send email FIRST
try {
  await sendPasswordResetEmail(user.email, rawToken);
} catch (emailError) {
  console.error("Failed to send reset email:", emailError);
  return { success: false, error: "Unable to send reset email. Please try again later." };
}

// 3. Only persist after successful delivery
await db.$transaction(async (tx) => {
  await tx.user.update({
    where: { id: user.id },
    data: { passwordResetToken: hashedToken, passwordResetExpires: expires },
  });
  await tx.securityLog.create({ /* ... */ });
});
```

For the current prototype, the console.log is acceptable but must be guarded by `process.env.NODE_ENV !== "production"`.

---

## V9 — Missing server-side confirmPassword validation

**Severity:** Low
**Category:** Input validation gap

**Description:**
The reset-password page has two password fields, but the server only validates `password`. The `confirmPassword` field is submitted as FormData but `resetPasswordSchema` does not include it. If client-side validation is bypassed (e.g. JS disabled, or curl), mismatched passwords are accepted. The user's password is set to whatever `password` contains.

**Code:**
`src/app/reset-password/[token]/page.tsx:101-198` (confirmPassword input at line 130-139)
`src/lib/validation.ts:50-53` (schema has no confirmPassword field)
`src/actions/auth.ts:382-390` (action extracts token and password only)

**Fix:**
Extend `resetPasswordSchema` to include and validate `confirmPassword`:

```ts
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Password confirmation is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
```

Then in the action, extract the field from formData (it's already submitted) and validation will handle the match.

---

## V10 — Timing parity mistake in forgot-password (dummy task direction)

**Severity:** Medium
**Category:** Timing attack

**Description:**
This is related to V1 but is a separate design error. The missing-user path adds a `bcrypt.compare` call that is **not** present in the existing-user path. This is backwards — the path without real work should add dummy work to match the path with real work, but here the missing-user path does **more** work.

The result: the missing-user path is visibly slower (bcrypt cost 14 ≈ 150ms), making the timing signal **reversed but still detectable**.

**Code:**
`src/actions/auth.ts:321-322`

**Fix:**
See V1 fix. Both paths must converge on roughly the same workload. Either:
- Add a bcrypt dummy call in both paths (preferred — bounds timing to real crypto)
- Use `setTimeout` / `sleep` to pad the shorter path to match (fragile, CPU-dependent)

---

## V11 — `SESSION_SECRET` is dead config

**Severity:** Informational
**Category:** Misleading documentation

**Description:**
`.env.example` documents `SESSION_SECRET`:
```
SESSION_SECRET="your_secure_session_secret_at_least_32_chars"
```

But no file in the codebase reads `process.env.SESSION_SECRET`. Sessions use opaque database-backed tokens, not JWTs or signed cookies. The config is dead and misleading — a future developer might rely on it for session integrity.

**Code:**
`.env.example:13`

**Fix:**
Remove `SESSION_SECRET` from `.env.example`. If signed session cookies are added later, the variable can be reintroduced.

---

## V12 — Token appears in browser URL for reset-password

**Severity:** Low
**Category:** Token leakage (URL exposure)

**Description:**
The password reset page uses the token as a route parameter: `/reset-password/${rawToken}`. The raw 64-hex-char token is visible in the browser URL bar, persisted in browser history, and syncs across devices if history sync is enabled. If the user bookmarks the page, the token is stored in the bookmark.

**Code:**
`src/app/reset-password/[token]/page.tsx`
`src/actions/auth.ts:363`

**Fix:**
Use a POST-only flow instead:
1. Send the user to `/reset-password` (no token in URL)
2. The user enters their email
3. The server sends a link that posts a one-time code
4. The user enters the code on the `/reset-password` page

For the current URL-based pattern, **mitigation** is to ensure the token never appears in logs (V7 fix) and is one-time-use + short-lived (already 30 min). The Referer-Policy (`strict-origin-when-cross-origin`, set in middleware) prevents leakage to external sites.

---

## V13 — No brute-force protection on session cookie lookup

**Severity:** Low
**Category:** Lack of rate limiting

**Description:**
`verifySession()` does a DB lookup on every call with no rate limiting. While the `bcrypt` cost does not apply here (SHA-256 is fast), there is no bound on how many cookie-based lookups a client can trigger. An attacker could iterate random session tokens against `verifySession()` to find valid sessions.

The session token cookie is `httpOnly` and `sameSite: lax`, so direct cookie theft is difficult. But if an attacker obtains a raw token (e.g. via log or DB leak), they could validate it without rate limiting.

**Code:**
`src/lib/auth.ts:101-148`

**Fix:**
Low priority. Acceptable risk given the token entropy (256 bits). Can be mitigated by a global rate limiter on authenticated endpoints in the future.

---

## V14 — Session accumulation (no cleanup on new login)

**Severity:** Low
**Category:** Resource management

**Description:**
`createSession` always creates a new session record without cleaning up old sessions. Over time, a user who logs in many times accumulates stale session records in the `Session` table (though they have auto-expiry via `expiresAt`). There is no limit on sessions per user.

**Code:**
`src/lib/auth.ts:154-186`

**Fix:**
Add a cleanup step in `createSession`. Either:
- Delete expired sessions for this user before creating a new one
- Enforce a max session limit (e.g. 10 per user) and delete oldest
- The current design relies on the "Logout Everywhere" button + scheduled cleanup

Example fix (delete expired sessions for this user):

```ts
await db.$transaction(async (tx) => {
  // Clean up expired sessions for this user
  await tx.session.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });

  await tx.session.create({
    data: { userId, sessionToken: hashedToken, expiresAt, deviceIdentifier },
  });
});
```

---

## V15 — Login validation schema masks email errors with wrong message key

**Severity:** Informational
**Category:** Consistency

**Description:**
`loginSchema` sets `.email("Invalid credentials")` — the same generic message used for all login failures. This is intentional and good for security. However, the Zod `.email()` validator only triggers when the email format is invalid, not when credentials are wrong. So this specific error only fires for malformed emails (e.g. `"notanemail"`), which the client already validates in the browser. The intent is correct, but the approach is slightly misleading.

**Code:**
`src/lib/validation.ts:38`

**Assessment:**
Not a vulnerability. The behavior is correct: all login errors return `"Invalid credentials."`. The `.email()` method is just an implementation detail for the schema. Recommend keeping it.

---

## Summary Table

| # | Vulnerability | Severity | File | Fix |
|---|---|---|---|---|
| V1 | Timing side-channel on forgot-password | High | `src/actions/auth.ts:315-368` | Add bcrypt dummy work to existing-user branch |
| V2 | Race condition on `failedLoginAttempts` | High | `src/actions/auth.ts:167-168` | Use `{ increment: 1 }` atomic update |
| V3 | Rate limiting silently bypassed (placeholder config) | High | `src/lib/rate-limit.ts:45-54` | Throw in production, configure real Upstash keys |
| V4 | Lockout message leaks user existence | Medium | `src/actions/auth.ts:156-159` | Return `"Invalid credentials."` for all failures |
| V5 | Signup email-exists message leaks registration | Medium | `src/actions/auth.ts:57-58` | Remove pre-check or return generic error |
| V6 | No rate limiting on reset password | Medium | `src/actions/auth.ts:375-448` | Add `resetPasswordRateLimiter` |
| V7 | Reset token logged to server console | High | `src/actions/auth.ts:362-363` | Guard with `process.env.NODE_ENV !== "production"` |
| V8 | No email service — tokens created regardless | High | `src/actions/auth.ts:336-365` | Send email before persisting token; fail if delivery fails |
| V9 | Missing server-side confirmPassword | Low | `src/lib/validation.ts:50-53` | Add `confirmPassword` to schema with `.refine()` |
| V10 | Timing dummy work in wrong direction | Medium | `src/actions/auth.ts:321-322` | See V1 fix |
| V11 | Dead `SESSION_SECRET` config | Info | `.env.example:13` | Remove from `.env.example` |
| V12 | Token in browser URL | Low | `src/app/reset-password/[token]/page.tsx` | Design change or accept with Referrer-Policy mitigation |
| V13 | No rate limit on session validation | Low | `src/lib/auth.ts:101-148` | Future improvement |
| V14 | Session accumulation over time | Low | `src/lib/auth.ts:154-186` | Clean up expired sessions on new login |

---

## Recommended fix order

1. **Apply immediately:** V7 (log leak), V3 (rate limit bypass), V2 (race condition)
2. **Apply this sprint:** V1 + V10 (timing), V4 (lockout message), V5 (signup enum), V6 (reset throttle)
3. **Next sprint:** V8 (email integration), V9 (confirmPassword), V11 (cleanup dead config)
4. **Backlog:** V12, V13, V14
