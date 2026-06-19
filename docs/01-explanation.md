# Kolo Kept — Explained Like You Are Seven

Imagine you have a piggy bank app that keeps your savings safe. This app has three special
security guards that work together to protect it. Let me show you how each one works.

---

## 1. How Rate Limiting Decides When to Block a Request

**The problem:** Bad guys might try to guess your password by typing really fast, over and
over again. We need a way to say "slow down, you're being too noisy!"

**The solution:** Think of a cafeteria lady with a clicker counter.

### The Cafeteria Lady (Rate Limiter)

There are two different cafeteria ladies, one for each door:

| Door | Lady | Rule |
|------|------|------|
| Login door | Login Lady | 5 tries every 15 minutes |
| Forgot-password door | Forgot Lady | 3 tries every 1 hour |

Here's how the Login Lady works when someone walks up:

1. **Check the clicker.** She looks at a special notepad (called **Upstash Redis**) that
   remembers everyone who came to this door. The notepad has a timer built in — it
   automatically forgets old visits after 15 minutes.

2. **Still under 5?** If the person has visited 3 times, that's fine — the clicker says 3,
   which is less than 5, so she lets them in.

3. **Hit 5 already?** If the clicker says 5 and the timer hasn't run out yet, she says:
   *"Too many login attempts. Try again in 15 minutes."* **BLOCKED.**

4. **Is the notepad broken?** If the special notepad (Redis server) is down, she gets
   super suspicious and blocks everybody anyway. Better safe than sorry.

5. **No notepad at all?** If the app doesn't have a notepad (like on a developer's
   computer), she just shrugs and lets everyone through, but writes a warning in her
   diary.

Every time a request comes in, the lady writes down the person's **IP address** (their
"face") on the notepad. So if your IP address has been naughty, only *you* get blocked,
not your friend sitting next to you.

The code that makes this happen lives in `src/lib/rate-limit.ts` (lines 41-75).

---

## 2. How Account Lockout State Is Stored and Checked

**The problem:** What if someone guesses your password 50 times over the course of a
whole week? The rate limit lady resets every 15 minutes, so they could try 5 times,
wait, try 5 more, wait, try 5 more...

**The solution:** A **permanent-ish** record that tracks *your specific account*.

### The Clipboard on the Account

Every user in the database has two special fields (see `prisma/schema.prisma`, lines
16-17):

```
failedLoginAttempts: 0   (starts at zero)
accountLockedUntil: ???  (starts as empty/null)
```

Think of it like a clipboard hanging on your account's locker:

- **A tally counter** (`failedLoginAttempts`) — it counts every wrong password guess.
- **A padlock timer** (`accountLockedUntil`) — if the padlock sets, nobody can open the
  locker until the timer runs out.

### How it works during login

(All of this happens in `src/actions/auth.ts`, lines 145-213.)

**Step 1 — Check the padlock.** When you try to log in, the app looks at your clipboard.
If `accountLockedUntil` is a time in the *future*, the app says: *"Nope! Your account is
locked. Wait or reset your password."* A guard writes `ACCOUNT_LOCKOUT_BLOCKED` in the
logbook (the `SecurityLog` table).

**Step 2 — Wrong password!** If you typed the wrong password, the app adds **1** to your
tally counter. So if you had 3 failed attempts, now you have 4.

**Step 3 — Hit 10?** If the counter reaches **10**, the app slaps a padlock on your
account for **1 hour** (60 × 60 × 1000 milliseconds). It writes `ACCOUNT_LOCKOUT` in the
logbook. If you were at 9 and now you're at 10, BAM, locked.

**Step 4 — Correct password!** If you finally type the right password, the app:
- Sets `failedLoginAttempts` back to **0** (wipes the tally clean)
- Sets `accountLockedUntil` to **null** (removes the padlock)
- Writes `LOGIN_SUCCESS` in the logbook

### Even your session gets locked out

There's a second check that happens when you try to visit the dashboard or any protected
page (in `src/lib/auth.ts`, lines 137-145). If your account is in lockout the app
**deletes your session cookie** and kicks you out immediately. So even if you were
already logged in before the lockout, you can't stay in.

### Reset your password = free unlock

When you successfully reset your password (more on that below), the app also sets
`failedLoginAttempts` to 0 and clears `accountLockedUntil`. So a password reset is also
an "unlock everything" button.

---

## 3. How the Password Reset Token Flow Works

**The problem:** You forgot your password. You need a way to prove you own the email
address, then pick a new password.

**The solution:** A **magic one-time link** delivered to your email.

### The cast of characters

- **Token** — a super-secret 64-character code (like
  `a1b2c3d4e5f6...`) made by `crypto.randomBytes(32)` in `src/lib/auth.ts:57`.
- **Hashed token** — the raw token run through a blender (SHA-256) so that even if bad
  guys steal the database, they can't figure out what the real token is
  (`src/lib/auth.ts:50`).
- **Token in DB** — only the *hashed* version is stored, along with an expiry time of
  **30 minutes** (`prisma/schema.prisma:18-19`).

### The full journey

#### Part A: "I forgot my password!" (src/actions/auth.ts, lines 286-370)

1. **Rate check.** First, the Forgot Lady checks her clicker: max 3 times per hour per
   IP address. If you've already asked 3 times, go away.

2. **Look up email.** The app searches for your email in the database.

3. **Secret trick (no peeking).** If the email doesn't exist, the app still pretends to
   do some work (a fake bcrypt compare) so that a bad guy can't tell the difference
   between "email not found" and "email found but wrong password." This stops them from
   figuring out which emails have accounts.

4. **Generate the magic link.** A 64-character random token is created. The app blends
   it through SHA-256 and stores the **blended version** in your user row, along with an
   expiry of **30 minutes from now**.

5. **Log it.** An entry `PASSWORD_RESET_REQUEST` goes into the security log.

6. **Tell the user.** Because this is a demo app without a real email service, the link
   is printed to the server console:
   ```
   http://localhost:3000/reset-password/a1b2c3d4e5f6...
   ```
   The user gets a generic message: *"If an account is associated with this email, a
   secure password reset link has been sent."*

#### Part B: User clicks the link (src/actions/auth.ts, lines 375-448)

1. **The URL route.** The link goes to `/reset-password/[token]` (see
   `src/app/reset-password/[token]/page.tsx`), which pulls the raw token from the URL
   and shows a "type your new password" form.

2. **Strong rules.** The new password must be at least 12 characters, with at least one
   uppercase letter, one lowercase, one number, and one special symbol like `!` or `@`.
   The form won't even let you submit until all the boxes are checked.

3. **Submit the form.** The raw token and the new password are sent to the server.

4. **Hash the token.** The server blends the raw token through SHA-256 and looks for a
   user whose `passwordResetToken` matches AND whose `passwordResetExpires` is still in
   the future.

5. **Not found?** If no user matches, the server does another fake bcrypt compare
   (timing attack protection again) and says *"Invalid or expired reset token."*

6. **Found!** The server:
   - Hashes the new password with bcrypt (cost 14 — very slow, very safe)
   - In a **database transaction** (all-or-nothing batch):
     - Updates the password hash
     - Clears `passwordResetToken` and `passwordResetExpires` so the link can't be used
       again
     - Sets `failedLoginAttempts` to 0 and `accountLockedUntil` to null (unlocks the
       account)
     - **Deletes every active session** for that user (forces logout everywhere)
     - Writes `PASSWORD_RESET_COMPLETE` to the security log
   - Destroys the local session cookie

7. **Redirect to login.** The user sees a success screen and clicks "Go to login" with
   their new password.

### Why it's safe

| Bad Guy Trick | How We Defeat It |
|---------------|------------------|
| Guess the token | It's 64 random hex chars (256 bits) — that's more combinations than there are stars in the universe |
| Steal the database | Only SHA-256 *hashes* are stored; the raw token is never saved |
| Reuse a link | After success, both `passwordResetToken` and `passwordResetExpires` are wiped to null |
| Slow link | The token expires in 30 minutes |
| Timing attacks | Fake bcrypt compares hide whether the email/token exists |
| Stay logged in after reset | All sessions are force-deleted |

---

## How It All Connects

```
          ┌─────────────────────────────┐
          │     Rate Limiter (Redis)    │
          │  Blocks by IP, auto-forgets │
          │     after time window       │
          └──────────┬──────────────────┘
                     │
                     ▼
          ┌─────────────────────────────┐
          │     Account Lockout (DB)    │
          │  Tracks per-user failures,  │
          │   locks after 10 wrongs     │
          └──────────┬──────────────────┘
                     │
                     ▼
          ┌─────────────────────────────┐
          │  Password Reset (DB + URL)  │
          │   One-time hashed token,    │
          │   30 min expiry, unlocks    │
          │   account on success        │
          └─────────────────────────────┘
```

Rate limiter slows down the **town** (by IP address).
Account lockout guards the **house** (by user account).
Password reset is the **spare key** that also fixes the lock.
