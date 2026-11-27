import { db } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { staffCaller } from "@/lib/staff-caller";

/** The staff answer plus the cohort the caller paid for. */
export async function bootcampCaller() {
  const { userId, isStaff } = await staffCaller();
  if (!userId) return { userId: null, isStaff: false, bootcampTerm: null };

  const member = await (db as DrizzleDB).query.members.findFirst({
    where: { userId },
    columns: { bootcampTerm: true },
  });

  return {
    userId,
    isStaff,
    // Compared against the file's own term, never the current one.
    bootcampTerm: member?.bootcampTerm ?? null,
  };
}
