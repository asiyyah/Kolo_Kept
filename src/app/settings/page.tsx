import React from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession, hashToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { logoutAction, logoutAllAction } from "@/actions/auth";
import Link from "next/link";
import {
  PiggyBank,
  ArrowLeft,
  Shield,
  Monitor,
  Clock,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

export default async function SettingsPage() {
  const user = await verifySession();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const rawSessionToken = cookieStore.get("session_token")?.value;
  const currentHashedSession = rawSessionToken
    ? hashToken(rawSessionToken)
    : "";

  const activeSessions = await db.session.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-light)] text-[var(--accent)]">
              <PiggyBank className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Kolo Kept
            </span>
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="text-sm font-medium text-[var(--text-primary)] transition hover:text-[var(--accent)]"
              >
                Settings
              </Link>
            </nav>
            <div className="flex items-center gap-2 border-l border-[var(--border)] pl-4">
              <ThemeToggle />
              <form action={logoutAction} className="inline">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            Settings
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Manage your account and security preferences
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)]">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Security & Access
                  </h3>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Sessions and preferences
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="md:col-span-2 space-y-6">
            {/* Active Sessions */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Monitor className="h-4 w-4 text-[var(--accent)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Active Sessions
                </h2>
              </div>
              <p className="mb-4 text-xs text-[var(--text-secondary)]">
                You are logged in on {activeSessions.length} device
                {activeSessions.length !== 1 ? "s" : ""}.
              </p>

              <div className="space-y-2">
                {activeSessions.map((session) => {
                  const isCurrent =
                    session.sessionToken === currentHashedSession;
                  return (
                    <div
                      key={session.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        isCurrent
                          ? "border-[var(--accent-light)] bg-[var(--accent-lighter)]"
                          : "border-[var(--border)] bg-[var(--surface-secondary)]"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-md ${
                          isCurrent
                            ? "bg-[var(--accent-light)] text-[var(--accent)]"
                            : "bg-[var(--border)] text-[var(--text-tertiary)]"
                        }`}
                      >
                        <Monitor className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {session.deviceIdentifier}
                          </span>
                          {isCurrent && (
                            <span className="rounded bg-[var(--accent-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                          <Clock className="h-3 w-3" />
                          Logged in{" "}
                          {new Date(session.createdAt).toLocaleDateString(
                            undefined,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </p>
                        <p className="text-[10px] text-[var(--text-tertiary)]">
                          Expires{" "}
                          {new Date(session.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Logout Everywhere */}
            <div className="rounded-xl border border-[var(--danger-light)] bg-[var(--surface)] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--danger-light)] text-[var(--danger)] shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Logout Everywhere
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
                    This will invalidate all active sessions across all devices
                    and browsers. You will need to sign in again everywhere.
                  </p>
                  <div className="mt-3">
                    <form action={logoutAllAction}>
                      <button
                        type="submit"
                        className="rounded-lg border border-[var(--danger-light)] bg-[var(--danger-light)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition hover:bg-[var(--danger)] hover:text-white"
                      >
                        Logout Everywhere
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            {/* Theme Preference */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Theme
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Toggle between light and dark mode
                  </p>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--text-tertiary)]">
        &copy; {new Date().getFullYear()} Kolo Kept. All rights reserved.
      </footer>
    </div>
  );
}
