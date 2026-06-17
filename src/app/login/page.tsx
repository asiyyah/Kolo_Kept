"use client";

import React, { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginAction } from "@/actions/auth";
import { Mail, Lock, Loader2, AlertTriangle } from "lucide-react";
import Input from "@/components/Input";
import PasswordInput from "@/components/PasswordInput";

export default function LoginPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(loginAction, {
    success: false,
  });

  useEffect(() => {
    if (state.success) {
      const timeout = setTimeout(() => router.push("/dashboard"), 1000);
      return () => clearTimeout(timeout);
    }
  }, [state.success, router]);

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
            Sign in to Kolo Kept
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Enter your credentials to continue
          </p>
        </div>

        {state.error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-[var(--danger-light)] bg-[var(--danger-light)] px-3.5 py-3 text-sm text-[var(--danger)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        {state.success ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-light)] text-[var(--success)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Signing you in...
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Redirecting to dashboard
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
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
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-[var(--text-primary)]"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]"
                >
                  Forgot?
                </Link>
              </div>
              <PasswordInput
                id="password"
                name="password"
                required
                placeholder="••••••••"
                leftIcon={<Lock className="h-4 w-4" />}
                disabled={isPending}
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
