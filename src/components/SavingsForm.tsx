"use client";

import React, { useActionState, useEffect, useRef } from "react";
import { createSavingsAction } from "@/actions/savings";
import { PlusCircle, Loader2 } from "lucide-react";

export default function SavingsForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(createSavingsAction, {
    success: false,
  });

  useEffect(() => {
    if (state.success && formRef.current) {
      formRef.current.reset();
      const dateInput = formRef.current.elements.namedItem(
        "date",
      ) as HTMLInputElement;
      if (dateInput) {
        dateInput.value = new Date().toISOString().split("T")[0];
      }
    }
  }, [state.success]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)]">
          <PlusCircle className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Add Savings Entry
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Record a new savings deposit
          </p>
        </div>
      </div>

      {state.error && (
        <div className="mb-4 rounded-lg border border-[var(--danger-light)] bg-[var(--danger-light)] px-3.5 py-2.5 text-xs text-[var(--danger)]">
          {state.error}
        </div>
      )}

      <form ref={formRef} action={formAction} className="space-y-4">
        <div>
          <label
            htmlFor="amount"
            className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
          >
            Amount (₦)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            required
            min="0.01"
            placeholder="5000.00"
            disabled={isPending}
          />
        </div>

        <div>
          <label
            htmlFor="date"
            className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
          >
            Date Saved
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().split("T")[0]}
            disabled={isPending}
          />
        </div>

        <div>
          <label
            htmlFor="note"
            className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
          >
            Note / Description
          </label>
          <input
            id="note"
            name="note"
            type="text"
            required
            placeholder="Weekend savings"
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
            "Save Entry"
          )}
        </button>
      </form>
    </div>
  );
}
