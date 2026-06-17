"use server";

import { db } from "@/lib/db";
import { verifySession } from "@/lib/auth";
import { savingsEntrySchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

interface ActionResponse {
  success: boolean;
  error?: string;
}

/**
 * Server Action: Create Savings Entry
 */
export async function createSavingsAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResponse> {
  const user = await verifySession();

  if (!user) {
    return { success: false, error: "Unauthorized access." };
  }

  const rawFields = {
    amount: formData.get("amount") ? Number(formData.get("amount")) : undefined,
    note: formData.get("note"),
    date: formData.get("date"),
  };

  // Validate fields
  const validation = savingsEntrySchema.safeParse(rawFields);
  if (!validation.success) {
    const errorMsg = validation.error.issues.map((e) => e.message).join(", ");
    return { success: false, error: errorMsg };
  }

  const { amount, note, date } = validation.data;

  try {
    await db.savingsEntry.create({
      data: {
        userId: user.id,
        amount,
        note,
        date,
      },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Create savings entry error:", error);
    return { success: false, error: "Failed to save entry." };
  }
}

/**
 * Server Action: Delete Savings Entry
 */
export async function deleteSavingsAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResponse> {
  const user = await verifySession();

  if (!user) {
    return { success: false, error: "Unauthorized access." };
  }

  const entryId = formData.get("id") as string;

  if (!entryId) {
    return { success: false, error: "Entry identifier is required." };
  }

  try {
    // Delete entry only if it belongs to the logged-in user to prevent ID direct reference traversal
    const deleteResult = await db.savingsEntry.deleteMany({
      where: {
        id: entryId,
        userId: user.id,
      },
    });

    if (deleteResult.count === 0) {
      return { success: false, error: "Entry not found or unauthorized." };
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Delete savings entry error:", error);
    return { success: false, error: "Failed to delete entry." };
  }
}
