import { Hono } from "hono";
import { cors } from "hono/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { PanelDb } from "@panel/db";
import { event, loginCode, membership, organization, user, visit } from "@panel/db";
import { hashCode, newLoginCode, roleAtLeast, signActor, verifyActor } from "./auth";
import { sendLoginCode } from "./mail";
import type { Role } from "./auth";
import type { Bus } from "./bus";
import { InMemoryBus } from "./bus";
import { feedbackCard, feedbackTokenForExternal, actorForApiKey } from "./services/catalog";
import { organizerFloor } from "./services/floor";
import { liveSnapshot } from "./services/live";
import { inspectRun, publishedPlacements } from "./services/results";
import type { Metrics } from "./metrics";
import { appRouter } from "./router";
import type { Context } from "./router";

const openApi = {
  openapi: "3.0.3",
  info: {
    title: "Panel",
    version: "0.0.0",
    description:
      "REST mirror of the tRPC procedures. Send Authorization: Bearer with a JWT or an API key, except for the public routes.",
  },
  paths: {
    "/healthz": { get: { summary: "Process is up." } },
    "/readyz": { get: { summary: "Postgres answers. The bus is this process unless Redis is set." } },
    "/metrics": { get: { summary: "Prometheus metrics." } },
    "/openapi.json": { get: { summary: "This document." } },
    "/v1/auth/magic-link": { post: { summary: "Email a sign-in code. Dev auth returns the code." } },
    "/v1/auth/verify": { post: { summary: "Exchange a code for a JWT." } },
    "/v1/judges/apply": { post: { summary: "Apply to judge this event with the signed-in email." } },
    "/v1/public/{orgSlug}/{eventSlug}": { get: { summary: "Event name, phase, and branding." } },
    "/v1/session/next": { post: { summary: "Hand the signed-in judge their next table." } },
    "/v1/session/arrive": { post: { summary: "Mark arrival by table number or QR token." } },
    "/v1/session/vote": { post: { summary: "Store the score for the open visit." } },
    "/v1/session/skip": { post: { summary: "Pass on the open table without a score." } },
    "/v1/session/progress": { get: { summary: "How many projects this judge has scored." } },
    "/v1/session/compare": { post: { summary: "Record which of the last two tables was better." } },
    "/v1/session/rubric": { get: { summary: "Criteria for the event's default rubric." } },
    "/v1/catalog/projects": { get: { summary: "Projects for table cards. Organizer." } },
    "/v1/catalog/logs": { get: { summary: "Recent event log rows. Organizer." } },
    "/v1/catalog/tables": { get: { summary: "Floor tables and coordinates. Organizer." } },
    "/v1/catalog/judges": { get: { summary: "Judges and their status. Organizer." } },
    "/v1/live/{orgSlug}/{eventSlug}": { get: { summary: "Board snapshot: coverage, or placements after publish." } },
    "/v1/floor/{eventId}": { get: { summary: "Organizer floor: looks per table, and idle, walking, or overtime judges." } },
    "/v1/results/run/{runId}": { get: { summary: "One run, with rubric and pairwise components. Organizer." } },
    "/v1/results/{eventId}": { get: { summary: "Published placements. 403 before publish." } },
    "/v1/feedback/{token}": { get: { summary: "A team's card. 403 for an unknown token or before publish." } },
  },
};

export function createApp(options: {
  db: PanelDb;
  metrics: Metrics;
  jwtSecret: string;
  jwksUrl?: string;
  devAuth: boolean;
  smtpUrl?: string;
  busMode: "memory" | "redis";
  bus?: Bus;
}) {
  const bus = options.bus ?? new InMemoryBus();
  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.get("/readyz", async (c) => {
    try {
      await options.db.execute(sql`select 1`);
      return c.json({ ok: true, bus: options.busMode });
    } catch (error) {
      const message = error instanceof Error ? error.message : "database";
      return c.json({ ok: false, message }, 503);
    }
  });

  app.get("/metrics", async (c) => {
    const [open] = await options.db
      .select({ n: sql<number>`count(distinct ${visit.judgeId})::int` })
      .from(visit)
      .where(and(isNull(visit.completedAt), isNull(visit.voidedAt)));
    options.metrics.liveJudges.set(open?.n ?? 0);
    c.header("content-type", options.metrics.register.contentType);
    return c.body(await options.metrics.register.metrics());
  });

  app.get("/openapi.json", (c) => c.json(openApi));

  app.post("/v1/auth/magic-link", async (c) => {
    const body = z.object({ email: z.string().email() }).parse(await c.req.json());
    if (!options.devAuth && !options.smtpUrl) {
      return c.json({ ok: false, message: "SMTP is not configured" }, 503);
    }
    const code = newLoginCode();
    const email = body.email.toLowerCase();
    await options.db.insert(loginCode).values({
      email,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    if (options.smtpUrl) {
      await sendLoginCode(options.smtpUrl, email, code);
      return c.json({ ok: true });
    }
    return c.json({ ok: true, code });
  });

  app.post("/v1/auth/verify", async (c) => {
    const body = z
      .object({
        email: z.string().email(),
        code: z.string().length(6),
        org: z.string().optional(),
      })
      .parse(await c.req.json());
    const email = body.email.toLowerCase();
    const [row] = await options.db
      .select()
      .from(loginCode)
      .where(
        and(
          eq(loginCode.email, email),
          eq(loginCode.codeHash, hashCode(body.code)),
          isNull(loginCode.consumedAt),
        ),
      );
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return c.json({ ok: false, message: "Code is not valid" }, 401);
    }
    await options.db
      .update(loginCode)
      .set({ consumedAt: new Date() })
      .where(eq(loginCode.id, row.id));

    const [person] = await options.db
      .select()
      .from(user)
      .where(eq(user.email, email));
    let role: Role | null = null;
    let orgSlug: string | null = body.org ?? null;
    if (person) {
      const rows = await options.db
        .select({ role: membership.role, slug: organization.slug })
        .from(membership)
        .innerJoin(organization, eq(organization.id, membership.orgId))
        .where(eq(membership.userId, person.id));
      const chosen = orgSlug
        ? rows.find((item) => item.slug === orgSlug)
        : rows.length === 1
          ? rows[0]
          : undefined;
      if (chosen) {
        role = chosen.role;
        orgSlug = chosen.slug;
      }
    }

    if (!options.jwtSecret) {
      return c.json({ ok: false, message: "PANEL_JWT_SECRET is not set" }, 503);
    }
    const token = await signActor(
      {
        sub: person?.id ?? email,
        email,
        name: person?.name ?? email,
        org: orgSlug,
        role,
        judgeExternalId: null,
      },
      options.jwtSecret,
      60 * 60 * 12,
    );
    return c.json({ ok: true, token });
  });

  app.post("/v1/judges/apply", async (c) => {
    const body = z
      .object({ eventId: z.string().uuid(), name: z.string().min(1) })
      .parse(await c.req.json());
    return rest((caller) => caller.judge.applyToEvent(body))(c);
  });

  app.get("/v1/public/:orgSlug/:eventSlug", async (c) => {
    const [row] = await options.db
      .select({
        eventId: event.id,
        name: event.name,
        phase: event.phase,
        branding: organization.branding,
        orgName: organization.name,
      })
      .from(event)
      .innerJoin(organization, eq(organization.id, event.orgId))
      .where(
        and(
          eq(organization.slug, c.req.param("orgSlug")),
          eq(event.slug, c.req.param("eventSlug")),
        ),
      );
    if (!row) return c.json({ ok: false }, 404);
    return c.json(row);
  });

  const contextFor = async (c: { req: { header: (name: string) => string | undefined } }): Promise<Context> => {
    const header = c.req.header("authorization");
    let actor: Context["actor"] = null;
    if (header?.startsWith("Bearer ")) {
      const token = header.slice("Bearer ".length);
      try {
        actor = await verifyActor(token, {
          secret: options.jwtSecret,
          jwksUrl: options.jwksUrl,
        });
      } catch {
        actor = await actorForApiKey(options.db, token);
      }
    }
    return { db: options.db, actor, now: new Date(), bus, metrics: options.metrics };
  };

  const rest = (run: (caller: ReturnType<typeof appRouter.createCaller>) => Promise<unknown>) => {
    return async (c: Parameters<typeof contextFor>[0] & { json: (body: unknown, status?: number) => Response }) => {
      try {
        return c.json(await run(appRouter.createCaller(await contextFor(c))));
      } catch (error) {
        const message = error instanceof TRPCError ? error.message : "Request failed";
        const status = error instanceof TRPCError && error.code === "UNAUTHORIZED" ? 401 : 400;
        return c.json({ message }, status);
      }
    };
  };

  app.post("/v1/session/next", async (c) => {
    const body = z.object({ eventId: z.string().uuid() }).parse(await c.req.json());
    return rest((caller) => caller.session.next(body))(c);
  });
  app.post("/v1/session/arrive", async (c) => {
    const body = z
      .object({
        eventId: z.string().uuid(),
        qrToken: z.string().uuid().optional(),
        tableNumber: z.number().int().optional(),
      })
      .parse(await c.req.json());
    return rest((caller) => caller.session.arrive(body))(c);
  });
  app.post("/v1/session/vote", async (c) => {
    const body = z
      .object({
        eventId: z.string().uuid(),
        visitId: z.string().uuid(),
        comment: z.string().nullable().optional(),
        scores: z.array(z.object({ criterionId: z.string().uuid(), value: z.number() })),
      })
      .parse(await c.req.json());
    return rest((caller) => caller.session.vote({ ...body, comment: body.comment ?? null }))(c);
  });
  app.get("/v1/session/rubric", async (c) => {
    const eventId = z.string().uuid().parse(c.req.query("eventId"));
    return rest((caller) => caller.session.rubric({ eventId }))(c);
  });
  app.post("/v1/session/compare", async (c) => {
    const body = z
      .object({ eventId: z.string().uuid(), outcome: z.enum(["a", "b", "tie"]) })
      .parse(await c.req.json());
    return rest((caller) => caller.session.compare(body))(c);
  });
  app.post("/v1/session/skip", async (c) => {
    const body = z
      .object({ eventId: z.string().uuid(), visitId: z.string().uuid() })
      .parse(await c.req.json());
    return rest((caller) => caller.session.skip(body))(c);
  });
  app.get("/v1/session/progress", async (c) => {
    const eventId = z.string().uuid().parse(c.req.query("eventId"));
    return rest((caller) => caller.session.progress({ eventId }))(c);
  });

  app.get("/v1/catalog/projects", async (c) => {
    const eventId = z.string().uuid().parse(c.req.query("eventId"));
    return rest((caller) => caller.catalog.projects({ eventId }))(c);
  });
  app.get("/v1/catalog/logs", async (c) => {
    const eventId = z.string().uuid().parse(c.req.query("eventId"));
    return rest((caller) => caller.catalog.logs({ eventId }))(c);
  });
  app.get("/v1/catalog/tables", async (c) => {
    const eventId = z.string().uuid().parse(c.req.query("eventId"));
    return rest((caller) => caller.catalog.tables({ eventId }))(c);
  });
  app.get("/v1/catalog/judges", async (c) => {
    const eventId = z.string().uuid().parse(c.req.query("eventId"));
    return rest((caller) => caller.catalog.judges({ eventId }))(c);
  });

  app.get("/v1/floor/:eventId", async (c) => {
    const ctx = await contextFor(c);
    if (!ctx.actor || !roleAtLeast(ctx.actor.role, "organizer")) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const eventId = z.string().uuid().parse(c.req.param("eventId"));
    const floor = await organizerFloor(options.db, eventId, ctx.now);
    if (!floor) return c.json({ message: "Not found" }, 404);
    return c.json(floor);
  });

  app.get("/v1/live/:orgSlug/:eventSlug", async (c) => {
    const snapshot = await liveSnapshot(
      options.db,
      c.req.param("orgSlug"),
      c.req.param("eventSlug"),
    );
    if (!snapshot) return c.json({ ok: false }, 404);
    return c.json(snapshot);
  });

  app.get("/v1/results/run/:runId", async (c) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) return c.json({ message: "Unauthorized" }, 401);
    try {
      await verifyActor(header.slice("Bearer ".length), {
        secret: options.jwtSecret,
        jwksUrl: options.jwksUrl,
      });
    } catch {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const runId = z.string().uuid().parse(c.req.param("runId"));
    return c.json(await inspectRun(options.db, runId));
  });

  app.get("/v1/results/:eventId", async (c) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) return c.json({ message: "Unauthorized" }, 401);
    try {
      await verifyActor(header.slice("Bearer ".length), {
        secret: options.jwtSecret,
        jwksUrl: options.jwksUrl,
      });
    } catch {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const eventId = z.string().uuid().parse(c.req.param("eventId"));
    const placements = await publishedPlacements(options.db, eventId);
    if (!placements) return c.json({ message: "Not found" }, 404);
    if (!placements.published) return c.json({ message: "Forbidden" }, 403);
    return c.json(placements);
  });

  app.get("/v1/feedback/external/:eventId/:externalId", async (c) => {
    const ctx = await contextFor(c);
    if (!ctx.actor || !roleAtLeast(ctx.actor.role, "organizer")) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const eventId = z.string().uuid().parse(c.req.param("eventId"));
    const token = await feedbackTokenForExternal(options.db, eventId, c.req.param("externalId"));
    if (!token) return c.json({ message: "Forbidden" }, 403);
    return c.json({ token });
  });

  app.get("/v1/feedback/:token", async (c) => {
    const card = await feedbackCard(options.db, c.req.param("token"));
    if (card.status === "forbidden") return c.json({ message: "Forbidden" }, 403);
    return c.json(card);
  });

  app.all("/trpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => contextFor(c),
    }),
  );

  return app;
}
