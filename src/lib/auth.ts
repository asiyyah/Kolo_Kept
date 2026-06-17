import { db } from "./db";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { cookies, headers } from "next/headers";

const BCRYPT_SALT_ROUNDS = 14;
const SESSION_COOKIE_NAME = "session_token";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// A pre-computed dummy bcrypt hash (cost 14) to mitigate timing attacks on invalid users.
const DUMMY_HASH = "$2b$14$yX4P8YI2y99C7hKzG6.uOef3l1vRfeP9qJ4E3W2Q1e4k1h1g1f1d.";

/**
 * Validates password strength server-side.
 * Requirements: Min 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character.
 */
export function validatePasswordStrength(password: string): boolean {
  if (password.length < 12) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[!@#$%^&*()_+\-=\[\]{};':",./<>?|\\`~]/.test(password)) return false;
  return true;
}

/**
 * Hashes a plaintext password using bcrypt with cost factor 14.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Securely compares a password against a hash.
 * If user hash is missing (i.e. user not found), we compare against a dummy hash to prevent timing attacks.
 */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    // Perform dummy comparison to keep timing uniform
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

/**
 * Generates a SHA-256 hash of a raw session or reset token.
 * Hashed tokens are stored in the database so that a database breach does not allow token hijack.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a cryptographically secure random token.
 */
export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Retrieves IP and User Agent information from request headers.
 */
export async function getRequestMetadata() {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent") || "Unknown Device";
  const ipAddress =
    headerList.get("x-forwarded-for")?.split(",")[0].trim() ||
    headerList.get("x-real-ip") ||
    "127.0.0.1";
  return { userAgent, ipAddress };
}

/**
 * Parses user agent string into a readable device identifier.
 */
function parseDeviceIdentifier(userAgent: string): string {
  if (!userAgent || userAgent === "Unknown Device") return "Unknown";
  
  let os = "Unknown OS";
  let browser = "Unknown Browser";

  if (/windows/i.test(userAgent)) os = "Windows";
  else if (/macintosh|mac os x/i.test(userAgent)) os = "macOS";
  else if (/linux/i.test(userAgent)) os = "Linux";
  else if (/android/i.test(userAgent)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = "iOS";

  if (/chrome|crios/i.test(userAgent)) browser = "Chrome";
  else if (/firefox|fxios/i.test(userAgent)) browser = "Firefox";
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = "Safari";
  else if (/edge|edg/i.test(userAgent)) browser = "Edge";
  
  return `${browser} on ${os}`;
}

/**
 * Verifies the current session token from cookies against the database.
 * Auto-expires sessions if past expiresAt, and rejects locked users.
 */
export async function verifySession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const hashedToken = hashToken(rawToken);

  // Retrieve session and associated user
  const session = await db.session.findUnique({
    where: { sessionToken: hashedToken },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          accountLockedUntil: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  // Check if session has expired
  if (session.expiresAt < new Date()) {
    try {
      await db.session.delete({ where: { id: session.id } });
    } catch {
      // Ignore if already deleted
    }
    return null;
  }

  // Check if user is locked
  if (session.user.accountLockedUntil && session.user.accountLockedUntil > new Date()) {
    try {
      await db.session.delete({ where: { id: session.id } });
    } catch {
      // Ignore if already deleted
    }
    return null;
  }

  return session.user;
}

/**
 * Establishes a database-backed opaque session.
 * Stores the raw token in an HTTP-only cookie and the hashed token in the database.
 */
export async function createSession(userId: string) {
  const cookieStore = await cookies();
  const { userAgent } = await getRequestMetadata();
  const deviceIdentifier = parseDeviceIdentifier(userAgent);

  const rawToken = generateRandomToken();
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);

  // Session creation is written inside transaction to prevent data race conditions
  await db.$transaction(async (tx) => {
    // Optional: invalidate previous sessions on this same device to prevent session fixation/pileup
    await tx.session.create({
      data: {
        userId,
        sessionToken: hashedToken,
        expiresAt,
        deviceIdentifier,
      },
    });
  });

  // Set the HTTP-only secure cookie
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return rawToken;
}

/**
 * Destroys the current session from the database and deletes the cookie.
 */
export async function destroySession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return;

  const hashedToken = hashToken(rawToken);

  try {
    await db.session.delete({
      where: { sessionToken: hashedToken },
    });
  } catch {
    // Ignore error if session was already deleted or doesn't exist
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Invalidate every active session tied to a user.
 * Destroys all session records from the database and deletes the cookie.
 */
export async function destroyAllSessions(userId: string) {
  const cookieStore = await cookies();
  
  await db.$transaction(async (tx) => {
    await tx.session.deleteMany({
      where: { userId },
    });
  });

  cookieStore.delete(SESSION_COOKIE_NAME);
}
