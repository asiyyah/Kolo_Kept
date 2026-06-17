"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/actions/auth";
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import Input from "@/components/Input";

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, {
    success: false,
  });

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
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {state.error && (
          <div className="mb-4 rounded-lg border border-[var(--danger-light)] bg-[var(--danger-light)] px-3.5 py-3 text-sm text-[var(--danger)]">
            {state.error}
          </div>
        )}

        {state.success && state.message ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-light)] text-[var(--success)]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Check your email
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {state.message}
            </p>
            <div className="mt-4 rounded-md bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
              In development mode, the reset link is logged to the server
              console.
            </div>
            <Link
              href="/login"
              className="mt-5 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
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

            <button
              type="submit"
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Send reset link"
              )}
            </button>
          </form>
        )}

        {!state.success && (
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
