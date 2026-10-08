import { and, eq } from "drizzle-orm";
import { admins, db as clubDb, hackathons, judges } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createDbFromPool } from "@query/judging-db";
import type { PanelDb } from "@query/judging-db";
import {
  InMemoryBus,
  appRouter,
  createApp,
  createMetrics,
  ensureEvent,
} from "@query/judging-server";
import type { Actor, Role } from "@query/judging-server";
import { createContext } from "../context";
import {
  isBugTesterRole,
  isExpiredAdmin,
  isStaffRole,
} from "../types/portal-context";

/** Every hackathon edition is one judging event in this organization. */
export const PANEL_ORG = { slug: "hacklytics", name: "Hacklytics" } as const;

/** The judging event for an edition, keyed by the hackathon id. Created on first use. */
export async function panelEventFor(hackathon: { id: string; name: string }) {
  return ensureEvent(panel().db, {
    orgSlug: PANEL_ORG.slug,
    orgName: PANEL_ORG.name,
    eventSlug: hackathon.id,
    name: hackathon.name,
  });
}

type Embedded = {
  db: PanelDb;
  app: ReturnType<typeof createApp>;
  bus: InMemoryBus;
  metrics: ReturnType<typeof createMetrics>;
};

const globalForPanel = globalThis as unknown as { panel?: Embedded };

/**
 * Judging runs inside the portal: same process, same Postgres, and the portal
 * sign-in decides who the caller is. It borrows the club's pool rather than
 * opening its own: the club pool is tuned to let Neon scale to zero, and a
 * second pool would hold a second set of connections to the same database.
 * One instance per process, so the metrics registry is not rebuilt per request.
 */
export function panel(): Embedded {
  if (globalForPanel.panel) return globalForPanel.panel;
  if (!clubDb) throw new Error("DATABASE_URL is not set");
  const { db } = createDbFromPool(clubDb.$client);
  const metrics = createMetrics();
  const bus = new InMemoryBus();
  const app = createApp({
    db,
    metrics,
    bus,
    jwtSecret: process.env.PANEL_JWT_SECRET ?? "",
    devAuth: false,
    busMode: "memory",
    resolveActor: () => portalActor(),
  });
  globalForPanel.panel = { db, app, bus, metrics };
  return globalForPanel.panel;
}

/** The judging procedures, called by the portal itself to sync an edition. */
export function panelAsPortal() {
  const { db, bus, metrics } = panel();
  return appRouter.createCaller({
    db,
    bus,
    metrics,
    now: new Date(),
    actor: {
      sub: "portal",
      email: "portal",
      name: "Portal",
      org: null,
      role: "admin",
      judgeExternalId: null,
    },
  });
}

/**
 * The signed-in portal user as a judging actor. Staff organize, a volunteer
 * row is a volunteer, and a judge on a panel edition is matched by the email
 * on their judge row, which is the one synced into judging.
 */
export async function portalActor(): Promise<Actor | null> {
  const ctx = await createContext();
  const email = ctx.session?.user?.email;
  if (!ctx.db || !ctx.userId || !email) return null;
  const db = ctx.db as DrizzleDB;
  const [admin, judgeRows] = await Promise.all([
    db.query.admins.findFirst({
      where: and(eq(admins.userId, ctx.userId), eq(admins.isActive, true)),
    }),
    db
      .select({ email: judges.email })
      .from(judges)
      .innerJoin(hackathons, eq(hackathons.id, judges.hackathonId))
      .where(
        and(
          eq(judges.userId, ctx.userId),
          eq(judges.isActive, true),
          eq(hackathons.judgingBackend, "panel"),
        ),
      ),
  ]);
  return {
    sub: ctx.userId,
    email: judgeRows[0]?.email ?? email,
    name: ctx.session?.user?.name ?? email,
    org: PANEL_ORG.slug,
    role: roleFor(admin ?? null),
    judgeExternalId: null,
  };
}

function roleFor(
  admin: { role: string; expiresAt: Date | null } | null,
): Role | null {
  if (!admin || isExpiredAdmin(admin) || isBugTesterRole(admin.role)) {
    return null;
  }
  if (admin.role === "super_admin") return "owner";
  if (isStaffRole(admin.role)) return "admin";
  return "volunteer";
}
