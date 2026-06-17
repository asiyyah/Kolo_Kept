import { z } from "zod";

/**
 * Strict password strength validation:
 * - Minimum 12 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters long")
  .refine((val) => /[A-Z]/.test(val), "Password must contain at least one uppercase letter")
  .refine((val) => /[a-z]/.test(val), "Password must contain at least one lowercase letter")
  .refine((val) => /\d/.test(val), "Password must contain at least one number")
  .refine(
    (val) => /[!@#$%^&*()_+\-=\[\]{};':",./<>?|\\`~]/.test(val),
    "Password must contain at least one special character"
  );

export const signupSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be under 50 characters")
    .transform((val) => val.trim()),
  email: z
    .string()
    .email("Invalid email address")
    .transform((val) => val.trim().toLowerCase()),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z
    .string()
    .email("Invalid credentials") // Mask email error format during login
    .transform((val) => val.trim().toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .transform((val) => val.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: passwordSchema,
});

export const savingsEntrySchema = z.object({
  amount: z
    .number({ message: "Amount must be a number" })
    .positive("Amount must be greater than 0")
    .max(10000000, "Amount must be less than 10,000,000"),
  note: z
    .string()
    .min(1, "Description is required")
    .max(200, "Description must be under 200 characters")
    .transform((val) => val.trim()),
  date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid date format")
    .transform((val) => new Date(val)),
});
