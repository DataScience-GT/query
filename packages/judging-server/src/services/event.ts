import { and, eq, sql } from "drizzle-orm";
import { DEFAULT_TIMERS } from "@query/judging-core";
import type { PanelDb } from "@query/judging-db";
import { criterion, event, eventConfig, organization, rubric } from "@query/judging-db";

/** The five scores the club's judges have always given, each out of ten. */
const DEFAULT_CRITERIA = [
  ["creativity", "Creativity & Originality"],
  ["impact", "Impact & Relevance"],
  ["scope", "Scope & Technical Depth"],
  ["clarity", "Clarity & Engagement"],
  ["soundness", "Soundness & Accuracy"],
] as const;

/**
 * The event for one hackathon edition, created the first time it is asked
 * for: organization, event in setup, default config, and the default rubric.
 * Safe to call on every sync; an existing event is returned untouched.
 */
export async function ensureEvent(
  db: PanelDb,
  input: { orgSlug: string; orgName: string; eventSlug: string; name: string },
): Promise<{ eventId: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`panel:event:${input.orgSlug}:${input.eventSlug}`}))`,
    );
    await tx
      .insert(organization)
      .values({ slug: input.orgSlug, name: input.orgName })
      .onConflictDoNothing({ target: organization.slug });
    const [org] = await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, input.orgSlug));
    if (!org) throw new Error("Organization was not stored");

    const [existing] = await tx
      .select({ id: event.id })
      .from(event)
      .where(and(eq(event.orgId, org.id), eq(event.slug, input.eventSlug)));
    if (existing) return { eventId: existing.id };

    const [created] = await tx
      .insert(event)
      .values({ orgId: org.id, slug: input.eventSlug, name: input.name, phase: "setup" })
      .returning({ id: event.id });
    if (!created) throw new Error("Event was not stored");

    await tx.insert(eventConfig).values({
      eventId: created.id,
      targetSeconds: DEFAULT_TIMERS.targetSeconds,
      hardLimitSeconds: DEFAULT_TIMERS.hardLimitSeconds,
      walkLimitSeconds: DEFAULT_TIMERS.walkLimitSeconds,
      submitGraceSeconds: DEFAULT_TIMERS.submitGraceSeconds,
      minLooksPerProject: 1,
      dispatchStrategy: "coverage",
    });

    const [main] = await tx
      .insert(rubric)
      .values({ eventId: created.id, name: "Main", isDefault: true })
      .returning({ id: rubric.id });
    if (!main) throw new Error("Rubric was not stored");
    await tx.insert(criterion).values(
      DEFAULT_CRITERIA.map(([key, label], position) => ({
        rubricId: main.id,
        position,
        key,
        label,
        min: 1,
        max: 10,
        weight: 1,
      })),
    );
    return { eventId: created.id };
  });
}
