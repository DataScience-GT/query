import { and, eq } from "drizzle-orm";
import { admins, hackathons, judges } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createDb } from "@query/judging-db";
import type { PanelDb } from "@query/judging-db";
import {
  InMemoryBus,
  appRouter,
  createApp,
  createMetrics,
} from "@query/judging-server";
import type { Actor, Role } from "@query/judging-server";
import { createContext } from "../context";
import {
  isBugTesterRole,
  isExpiredAdmin,
  isStaffRole,
} from "../types/portal-context";

type Embedded = {
  db: PanelDb;
  app: ReturnType<typeof createApp>;
  bus: InMemoryBus;
  metrics: ReturnType<typeof createMetrics>;
};

const globalForPanel = globalThis as unknown as { panel?: Embedded };

/**
 * Judging runs inside the portal: same process, same Postgres, and the portal
 * sign-in decides who the caller is. One instance per process, so the metrics
 * registry and the pool are not rebuilt on every request.
 */
export function panel(): Embedded {
  if (globalForPanel.panel) return globalForPanel.panel;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db } = createDb(url, {
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: true }
        : undefined,
  });
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
    org: process.env.PANEL_ORG_SLUG ?? null,
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
