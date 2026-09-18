import { db, bootcampMaterials, events, members } from "@query/db";
import { eq } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
// Not resume-specific despite where it lives, and a second copy would be a
// second cache to go stale.
import { resumeCaller as portalCaller } from "./resume-access";

export { portalCaller };

/** One handout, with the term whose cohort paid for it. */
export async function loadMaterial(materialId: string) {
  const rows = await (db as DrizzleDB)
    .select({
      id: bootcampMaterials.id,
      eventId: bootcampMaterials.eventId,
      storageKey: bootcampMaterials.storageKey,
      fileName: bootcampMaterials.fileName,
      contentType: bootcampMaterials.contentType,
      sizeBytes: bootcampMaterials.sizeBytes,
      term: events.bootcampTerm,
    })
    .from(bootcampMaterials)
    .innerJoin(events, eq(events.id, bootcampMaterials.eventId))
    .where(eq(bootcampMaterials.id, materialId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * The material's own term, not the current one: whoever bought the fall
 * bootcamp keeps its files in January. A null term matches nobody — without
 * that guard it would match every member who bought no bootcamp at all.
 */
export async function enrolledInTerm(userId: string, term: string | null) {
  if (!term) return false;

  const member = await (db as DrizzleDB).query.members.findFirst({
    where: eq(members.userId, userId),
    columns: { bootcampTerm: true },
  });

  return member?.bootcampTerm === term;
}
