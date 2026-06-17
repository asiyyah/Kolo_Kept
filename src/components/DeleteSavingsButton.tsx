"use client";

import React, { useActionState } from "react";
import { deleteSavingsAction } from "@/actions/savings";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteSavingsButtonProps {
  id: string;
}

export default function DeleteSavingsButton({ id }: DeleteSavingsButtonProps) {
  const [, formAction, isPending] = useActionState(deleteSavingsAction, { success: false });

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="id" value={id} />

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--text-tertiary)] transition hover:bg-[var(--danger-light)] hover:text-[var(--danger)] disabled:opacity-50"
        title="Delete entry"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </form>
  );
}
