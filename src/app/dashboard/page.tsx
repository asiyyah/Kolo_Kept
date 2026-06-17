import React from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { logoutAction } from "@/actions/auth";
import SavingsForm from "@/components/SavingsForm";
import DeleteSavingsButton from "@/components/DeleteSavingsButton";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import {
  PiggyBank,
  LogOut,
  Calendar,
  ClipboardList,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";

const SAVINGS_GOAL = 5000;

export default async function DashboardPage() {
  const user = await verifySession();

  if (!user) {
    redirect("/login");
  }

  const savingsEntries = await db.savingsEntry.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
  });

  const totalSaved = savingsEntries.reduce(
    (sum, entry) => sum + entry.amount,
    0,
  );
  const goalProgress = Math.min((totalSaved / SAVINGS_GOAL) * 100, 100);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
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
                className="text-sm font-medium text-[var(--text-primary)] transition hover:text-[var(--accent)]"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Settings
              </Link>
            </nav>

            <div className="flex items-center gap-2 border-l border-[var(--border)] pl-4">
              <span className="hidden text-sm text-[var(--text-secondary)] sm:block">
                {user.name}
              </span>
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            Savings Overview
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Track your progress toward {formatCurrency(SAVINGS_GOAL)}
          </p>
        </div>

        {/* Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Total Saved */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                  Total Saved
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                  {formatCurrency(totalSaved)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Lifetime savings
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--success-light)] text-[var(--success)]">
                <PiggyBank className="h-4 w-4" />
              </div>
            </div>
          </div>

          {/* Goal Progress */}
          <div className="md:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                  Goal Progress
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Target:{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {formatCurrency(SAVINGS_GOAL)}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold text-[var(--accent)]">
                  {goalProgress.toFixed(1)}%
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Complete
                </p>
              </div>
            </div>

            <div className="h-2 rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--success)] transition-all duration-700"
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {formatCurrency(totalSaved)} saved of {formatCurrency(SAVINGS_GOAL)}
            </p>
          </div>
        </div>

        {/* Savings Form + History */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <SavingsForm />
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-[var(--accent)]" />
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Savings History
                  </h2>
                </div>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {savingsEntries.length} entries
                </span>
              </div>

              {savingsEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-tertiary)]">
                    <PiggyBank className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    No entries yet
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Add your first savings entry to get started
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                          Date
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                          Note
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                          Amount
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {savingsEntries.map((entry) => (
                        <tr
                          key={entry.id}
                          className="transition-colors hover:bg-[var(--bg-secondary)]"
                        >
                          <td className="whitespace-nowrap px-5 py-3.5 text-sm text-[var(--text-secondary)]">
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                              {new Date(entry.date).toLocaleDateString(
                                undefined,
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </span>
                          </td>
                          <td className="max-w-[200px] truncate px-5 py-3.5 text-sm font-medium text-[var(--text-primary)]">
                            {entry.note}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-right text-sm font-semibold text-[var(--success)]">
                            {formatCurrency(entry.amount)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-right">
                            <DeleteSavingsButton id={entry.id} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
