"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateRandomToken,
  createSession,
  destroySession,
  verifySession,
  getRequestMetadata,
} from "@/lib/auth";
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import {
  checkRateLimit,
  loginRateLimiter,
  forgotPasswordRateLimiter,
} from "@/lib/rate-limit";

interface ActionResponse {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * Server Action: User Registration (Signup)
 */
export async function signupAction(prevState: unknown, formData: FormData): Promise<ActionResponse> {
  const { userAgent, ipAddress } = await getRequestMetadata();

  // Validate form fields using Zod
  const rawFields = Object.fromEntries(formData.entries());
  const validation = signupSchema.safeParse(rawFields);

  if (!validation.success) {
    const errorMsg = validation.error.issues.map((e) => e.message).join(", ");
    return { success: false, error: errorMsg };
  }

  const { name, email, password } = validation.data;

  try {
    // Check if email already exists
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { success: false, error: "Email is already registered." };
    }

    // Hash password with cost factor 14
    const passwordHash = await hashPassword(password);

    // Create user and write security log within a transaction
    const newUser = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
        },
      });

      await tx.securityLog.create({
        data: {
          userId: user.id,
          email: user.email,
          action: "SIGNUP_SUCCESS",
          ipAddress,
          userAgent,
        },
      });

      return user;
    });

    // Create session (logs user in immediately after signup)
    await createSession(newUser.id);
    return { success: true };
  } catch (error) {
    console.error("Signup error:", error);
    return { success: false, error: "An unexpected error occurred during signup." };
  }
}

/**
 * Server Action: Secure User Login
 */
export async function loginAction(prevState: unknown, formData: FormData): Promise<ActionResponse> {
  const { userAgent, ipAddress } = await getRequestMetadata();

  // 1. Rate Limiting Check (Max 5 attempts per 15 mins per IP)
  const rateLimitRes = await checkRateLimit(loginRateLimiter, `login:${ipAddress}`);
  if (!rateLimitRes.success) {
    return {
      success: false,
      error: "Too many login attempts. Please try again in 15 minutes.",
    };
  }

  // 2. Input Validation
  const rawFields = Object.fromEntries(formData.entries());
  const validation = loginSchema.safeParse(rawFields);

  if (!validation.success) {
    return { success: false, error: "Invalid credentials." };
  }

  const { email, password } = validation.data;

  try {
    // 3. Look up user
    const user = await db.user.findUnique({
      where: { email },
    });

    // 4. Timing Attack Mitigation
    // If user is not found, compare password against dummy hash to keep timing consistent
    if (!user) {
      await verifyPassword(password, null);
      
      // Log failed login event for an unmapped email
      await db.securityLog.create({
        data: {
          email,
          action: "LOGIN_FAILED",
          ipAddress,
          userAgent,
        },
      });

      return { success: false, error: "Invalid credentials." };
    }

    // 5. Account Lockout Protection Check
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      await db.securityLog.create({
        data: {
          userId: user.id,
          email: user.email,
          action: "ACCOUNT_LOCKOUT_BLOCKED",
          ipAddress,
          userAgent,
        },
      });
      return {
        success: false,
        error: "Account is temporarily locked due to multiple failed login attempts. Please try again later or reset your password.",
      };
    }

    // 6. Verify Password
    const passwordMatch = await verifyPassword(password, user.passwordHash);

    if (!passwordMatch) {
      // Increment failed attempts and trigger lockout if limit reached
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const failedAttempts = user.failedLoginAttempts + 1;
        const lockUntil =
          failedAttempts >= 10 ? new Date(Date.now() + 60 * 60 * 1000) : null; // 1 hour lockout

        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: failedAttempts,
            accountLockedUntil: lockUntil,
          },
        });

        await tx.securityLog.create({
          data: {
            userId: user.id,
            email: user.email,
            action: failedAttempts >= 10 ? "ACCOUNT_LOCKOUT" : "LOGIN_FAILED",
            ipAddress,
            userAgent,
          },
        });
      });

      return { success: false, error: "Invalid credentials." };
    }

    // 7. Successful Login: Clear lockout and failed attempts inside a transaction
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          accountLockedUntil: null,
        },
      });

      await tx.securityLog.create({
        data: {
          userId: user.id,
          email: user.email,
          action: "LOGIN_SUCCESS",
          ipAddress,
          userAgent,
        },
      });
    });

    // Create session cookie and opaque database session record
    await createSession(user.id);
    return { success: true };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, error: "An unexpected error occurred during login." };
  }
}

/**
 * Server Action: Secure Logout
 */
export async function logoutAction(): Promise<void> {
  const { userAgent, ipAddress } = await getRequestMetadata();
  const user = await verifySession();

  if (user) {
    await db.securityLog.create({
      data: {
        userId: user.id,
        email: user.email,
        action: "LOGOUT",
        ipAddress,
        userAgent,
      },
    });
  }

  await destroySession();
  redirect("/login");
}

/**
 * Server Action: Logout Everywhere (Invalidate All Sessions)
 */
export async function logoutAllAction(): Promise<void> {
  const { userAgent, ipAddress } = await getRequestMetadata();
  const user = await verifySession();

  if (!user) {
    redirect("/login");
  }

  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.session.deleteMany({
        where: { userId: user.id },
      });

      await tx.securityLog.create({
        data: {
          userId: user.id,
          email: user.email,
          action: "LOGOUT_ALL",
          ipAddress,
          userAgent,
        },
      });
    });

    await destroySession(); // Clears local cookie
  } catch (error) {
    console.error("Logout everywhere error:", error);
  }

  redirect("/login");
}

/**
 * Server Action: Forgot Password Link Request
 */
export async function forgotPasswordAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResponse> {
  const { userAgent, ipAddress } = await getRequestMetadata();

  // 1. Rate Limiting Check (Max 3 reset requests per hour per IP)
  const rateLimitRes = await checkRateLimit(forgotPasswordRateLimiter, `forgot:${ipAddress}`);
  if (!rateLimitRes.success) {
    return {
      success: false,
      error: "Too many reset attempts. Please try again in an hour.",
    };
  }

  // 2. Validate Email
  const rawFields = Object.fromEntries(formData.entries());
  const validation = forgotPasswordSchema.safeParse(rawFields);

  if (!validation.success) {
    return { success: false, error: "Invalid email format." };
  }

  const { email } = validation.data;

  // Generic success response to prevent user enumeration
  const genericSuccessMessage =
    "If an account is associated with this email, a secure password reset link has been sent.";

  try {
    const user = await db.user.findUnique({
      where: { email },
    });

    // Timing mitigation: perform dummy task if user is missing
    if (!user) {
      await verifyPassword("dummy_password", null);
      
      await db.securityLog.create({
        data: {
          email,
          action: "PASSWORD_RESET_REQUEST_UNMAPPED",
          ipAddress,
          userAgent,
        },
      });

      return { success: true, message: genericSuccessMessage };
    }

    // Generate secure token and assign expiry (30 mins)
    const rawToken = generateRandomToken();
    const hashedToken = hashToken(rawToken);
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: hashedToken,
          passwordResetExpires: expires,
        },
      });

      await tx.securityLog.create({
        data: {
          userId: user.id,
          email: user.email,
          action: "PASSWORD_RESET_REQUEST",
          ipAddress,
          userAgent,
        },
      });
    });

    // Console log the secure link for prototype/dev purposes
    console.log(`\n🔑 [SECURITY AUDIT] PASSWORD RESET REQUESTED FOR: ${email}`);
    console.log(`🔗 RESET LINK: http://localhost:3000/reset-password/${rawToken}\n`);

    return { success: true, message: genericSuccessMessage };
  } catch (error) {
    console.error("Forgot password action error:", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}

/**
 * Server Action: Reset Password Execution
 */
export async function resetPasswordAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResponse> {
  const { userAgent, ipAddress } = await getRequestMetadata();

  // Validate form inputs
  const rawFields = Object.fromEntries(formData.entries());
  const validation = resetPasswordSchema.safeParse(rawFields);

  if (!validation.success) {
    const errorMsg = validation.error.issues.map((e) => e.message).join(", ");
    return { success: false, error: errorMsg };
  }

  const { token, password } = validation.data;
  const hashedToken = hashToken(token);

  try {
    // Retrieve user by hashed reset token
    const user = await db.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      // Timing mitigation
      await verifyPassword(password, null);
      return { success: false, error: "Invalid or expired reset token." };
    }

    // Hash new password (cost 14) and update within a transaction
    const newPasswordHash = await hashPassword(password);

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
          failedLoginAttempts: 0,
          accountLockedUntil: null,
        },
      });

      // Invalidate all active sessions for security after password change
      await tx.session.deleteMany({
        where: { userId: user.id },
      });

      await tx.securityLog.create({
        data: {
          userId: user.id,
          email: user.email,
          action: "PASSWORD_RESET_COMPLETE",
          ipAddress,
          userAgent,
        },
      });
    });

    // Destroy local cookie
    await destroySession();
    return { success: true };
  } catch (error) {
    console.error("Reset password action error:", error);
    return { success: false, error: "An unexpected error occurred during password reset." };
  }
}
