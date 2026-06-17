"use client";

import React, { useActionState, useState } from "react";
import Link from "next/link";
import { signupAction } from "@/actions/auth";
import { Check, X, User, Mail, Lock, Loader2 } from "lucide-react";
import Input from "@/components/Input";
import PasswordInput from "@/components/PasswordInput";

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState(signupAction, {
    success: false,
  });
  const [password, setPassword] = useState("");

  const checks = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':",./<>?|\\`~]/.test(password),
  };

  const strengthCount = Object.values(checks).filter(Boolean).length;

  const getStrengthLabel = () => {
    if (password.length === 0) return { label: "Empty", color: "bg-slate-400" };
    if (strengthCount <= 2) return { label: "Weak", color: "bg-red-500" };
    if (strengthCount <= 4) return { label: "Medium", color: "bg-amber-500" };
    return { label: "Strong", color: "bg-emerald-500" };
  };

  const strength = getStrengthLabel();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Create your account
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Start tracking your savings today
          </p>
        </div>

        {state.error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-[var(--danger-light)] bg-[var(--danger-light)] px-3.5 py-3 text-sm text-[var(--danger)]">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        {state.success ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-light)] text-[var(--success)]">
              <Check className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Account created
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Redirecting to dashboard
            </p>
            <script
              dangerouslySetInnerHTML={{
                __html:
                  'setTimeout(() => { window.location.href = "/dashboard" }, 1000)',
              }}
            />
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
              >
                Full name
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                placeholder="John Doe"
                leftIcon={<User className="h-4 w-4" />}
                disabled={isPending}
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
              >
                Email address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                leftIcon={<Mail className="h-4 w-4" />}
                disabled={isPending}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
              >
                Password
              </label>
              <PasswordInput
                id="password"
                name="password"
                required
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="h-4 w-4" />}
                disabled={isPending}
              />
            </div>

            {password.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Password strength
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${strength.color}`}
                  >
                    {strength.label}
                  </span>
                </div>
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                  <div
                    className={`h-full rounded-full transition-all ${strength.color}`}
                    style={{ width: `${(strengthCount / 5) * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    { key: "length", label: "12+ characters" },
                    { key: "uppercase", label: "Uppercase letter" },
                    { key: "lowercase", label: "Lowercase letter" },
                    { key: "number", label: "Number" },
                    { key: "special", label: "Special character" },
                  ].map(({ key, label: checkLabel }) => {
                    const passed = checks[key as keyof typeof checks];
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        {passed ? (
                          <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        )}
                        <span>{checkLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create account"
              )}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
