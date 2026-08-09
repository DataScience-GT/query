import { initTRPC, TRPCError } from "@trpc/server";
import type { TRPCDefaultErrorShape } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";
import {
  rateLimit,
  RATE_LIMITS,
  logSecurityEvent,
  ddosProtection,
  validateRequestSize,
} from "./middleware/security";

export const errorFormatter = ({
  shape,
  error,
}: {
  shape: TRPCDefaultErrorShape;
  error: TRPCError;
}) => {
  const isDev = process.env.NODE_ENV === "development";
  return {
    ...shape,
    message:
      error.code === "INTERNAL_SERVER_ERROR" && !isDev
        ? "An unexpected error occurred"
        : shape.message,
    data: {
      ...shape.data,
      zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      stack: isDev ? shape.data.stack : undefined, // Mask stack in production
    },
  };
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter,
});

export const createTRPCRouter = t.router;
export const mergeRouters = t.mergeRouters;

const requiresDb = t.middleware(async ({ ctx, next }) => {
  if (!ctx.db) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database unavailable",
    });
  }

  return next({
    ctx: {
      ...ctx,
      db: ctx.db,
    },
  });
});

/**
 * Dangerous markup is REJECTED, never rewritten.
 *
 * Rewriting means silently changing what somebody wrote, and an HTML parser
 * run over prose is destructive far beyond markup: it treats an unterminated
 * "<word" as an open tag and drops it along with everything after it. A
 * submission reading "picks the class where loss<threshold, then retrains"
 * would be stored as "picks the class where loss", with nothing to tell the
 * author it happened. Bouncing the request instead is visible and recoverable.
 *
 * The bar is deliberately "could this execute somewhere", not "does this look
 * like HTML" — React escapes on render, so this is defence in depth for the
 * places a value might reach an HTML sink, and a hackathon full of people
 * writing `vector<int>` or `a<b` must not be caught by it.
 */
const DANGEROUS_TAG =
  /<\s*\/?\s*(script|iframe|object|embed|link|meta|base|svg|math|style|form|input|button|img|video|audio|source|track|template|noscript|textarea|xmp|frame|frameset|applet)\b/i;

// An event handler only means anything inside a tag; matched loosely it would
// reject prose like "onboarding = great".
const TAG_WITH_HANDLER = /<[a-zA-Z][^>]*\bon[a-z]+\s*=/i;

// Still dangerous as plain text: whoever renders it into an href gets an
// executable link.
const SCRIPTABLE_URI = /javascript:/i;

const isPlainObject = (value: object) => {
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
};

/**
 * Rejects executable markup anywhere in a request payload, and rebuilds the
 * object so prototype-polluting keys cannot ride along. Strings are passed
 * through byte for byte — SQL injection is already covered by parameterised
 * queries, so nothing here guesses at SQL either, and ordinary prose ("select a
 * track from the list") has to survive untouched. Values that are not strings,
 * arrays or plain objects (Date, Buffer, …) are handed on as-is so the
 * procedure's own validator still sees them.
 */
/**
 * Ceiling on any array reaching a procedure, checked before zod runs.
 *
 * Must stay at or above the largest bound any input schema declares, or that
 * schema is unreachable: this throws "Array too large" first, so a procedure
 * advertising `.max(2500)` would reject at 501 with a message that names
 * neither the real limit nor the field. It sat at 500 while
 * batchUpdateParticipantStatus allowed 2500, which made approving a
 * 2000-person roster impossible in a single call.
 *
 * This is not the payload guard — scrubbing an array of uuids is linear and
 * cheap. Request size is bounded separately by validateRequestSize.
 */
const MAX_ARRAY_LENGTH = 2500;

const scrubMarkup = (input: unknown, depth = 0): unknown => {
  if (depth > 10) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Input too deeply nested",
    });
  }

  if (typeof input === "string") {
    if (
      DANGEROUS_TAG.test(input) ||
      TAG_WITH_HANDLER.test(input) ||
      SCRIPTABLE_URI.test(input)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid input: HTML and script content are not allowed",
      });
    }

    return input;
  }

  if (typeof input === "number" && !Number.isFinite(input)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid number" });
  }

  if (Array.isArray(input)) {
    if (input.length > MAX_ARRAY_LENGTH) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Array too large" });
    }
    return input.map((item) => scrubMarkup(item, depth + 1));
  }

  if (input !== null && typeof input === "object" && isPlainObject(input)) {
    const entries = Object.entries(input);
    if (entries.length > 50) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Object too complex",
      });
    }

    const scrubbed: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      if (!/^[\w.-]{1,100}$/.test(key)) {
        continue;
      }
      scrubbed[key] = scrubMarkup(value, depth + 1);
    }
    return scrubbed;
  }

  return input;
};

const sanitizeInputs = t.middleware(async ({ next, ctx, getRawInput }) => {
  const rawInput = await getRawInput();

  if (rawInput == null) {
    return next();
  }

  if (!validateRequestSize(rawInput)) {
    logSecurityEvent({
      type: "validation_error",
      identifier: ctx.userId ?? ctx.clientIp,
      details: "Request payload too large",
    });
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "Request payload is too large",
    });
  }

  const scrubbed = scrubMarkup(rawInput);

  // The validator and the resolver both read the input through getRawInput, so
  // replacing it here is what makes the scrubbed value the one that is stored.
  return next({ getRawInput: () => Promise.resolve(scrubbed) });
});

const enforceContentType = t.middleware(async ({ ctx, next, type }) => {
  if (type === "mutation" && ctx.req) {
    const contentType = ctx.req.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");
    const isMultipart = contentType
      .toLowerCase()
      .includes("multipart/form-data");
    if (contentType && !isJson && !isMultipart) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid Content-Type for mutation request",
      });
    }
  }
  return next();
});

const uploadSanitizeInputs = t.middleware(
  async ({ next, ctx, getRawInput }) => {
    // Allow up to 2MB for base64 image uploads
    const rawInput = await getRawInput();

    if (rawInput && !validateRequestSize(rawInput, 2 * 1024 * 1024)) {
      logSecurityEvent({
        type: "validation_error",
        identifier: ctx.userId ?? ctx.clientIp,
        details: "Upload payload too large (max 2MB)",
      });
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: "Image payload is too large (>2MB)",
      });
    }

    // We intentionally skip the recursive `scrubMarkup` here because it truncates
    // strings longer than 10,000 characters (base64 strings are much larger).
    // The zod validator on the procedure will ensure it's a valid data URI structure.

    const result = await next();

    if (!result.ok) {
      logSecurityEvent({
        type: "validation_error",
        identifier: ctx.userId ?? "unknown",
        details: "Upload Procedure failed",
      });
    }

    return result;
  },
);

/**
 * Surgical cache invalidation: each mutation path maps to the exact cache key
 * patterns it should evict, rather than blindly wiping an entire namespace.
 * Unmapped routes fall back to namespace-level eviction.
 */
const CACHE_INVALIDATION_MAP: Record<string, string[]> = {
  // Hackathon mutations — scope by what actually changed
  "hackathon.register": ["hackathon:*:participants", "hackathon:*:analytics"],
  "hackathon.updateParticipantStatus": [
    "hackathon:*:participants",
    "hackathon:*:analytics",
  ],
  "hackathon.batchUpdateParticipantStatus": [
    "hackathon:*:participants",
    "hackathon:*:analytics",
  ],
  // A badge scan changes one event's attendee count, not the roster. The
  // resolver evicts that single key by id; an empty list here keeps the
  // namespace fallback below from wiping every attendee's cached registrations
  // on every scan, all weekend, at every door.
  "hackathon.scanParticipantPass": [],
  "hackathon.create": ["hackathons:list"],
  "hackathon.update": ["hackathons:list", "hackathon:*"],
  "hackathon.delete": ["hackathons:list", "hackathon:*"],
  "hackathon.createEvent": ["hackathon:*:events"],
  "hackathon.updateEvent": ["hackathon:*:events"],
  "hackathon.deleteEvent": ["hackathon:*:events"],
  // Interest list. Both writes move the admin list and the caller's own
  // "am I on it" answer, and the two are read from the same namespace.
  "hackathon.registerInterest": ["hackathon:*:interest"],
  "hackathon.withdrawInterest": ["hackathon:*:interest"],
  // Judge mutations — only invalidate judging-related keys
  "judge.submitVote": ["hackathon:*:rankings", "hackathon:*:judge-analytics"],
  "judge.completeAndNext": [
    "hackathon:*:rankings",
    "hackathon:*:judge-analytics",
  ],
  "judge.toggleJudging": ["hackathon:*"],
  "judge.assignJudgesToProjects": [
    "hackathon:*:rankings",
    "hackathon:*:judge-analytics",
  ],
  // Promotion creates judgeable projects and flips submissions to "judging",
  // so both the public project list and the rankings view move.
  "judge.promoteSubmissions": [
    "hackathon:*:projects",
    "hackathon:*:public-projects*",
    "hackathon:*:rankings",
  ],
  // Announcements write their own rows and nothing cacheable. Empty rather than
  // absent, so neither one falls through to sweeping the whole hackathon
  // namespace — which includes every attendee's cached registrations.
  "hackathon.createAnnouncement": [],
  "hackathon.sendBatch": [],
  // Same: the marker lives on hackathon_interest, which is not cached, and the
  // admin list is read fresh.
  "hackathon.notifyRegistrationOpen": [],
  "judge.assignToHackathon": ["judge:*"],
  // Member mutations
  "member.update": ["member:*", "user:*:profile"],
  // A renewal changes the membership the portal reads, so its context must go too
  // Team mutations — team membership is embedded in both the public roster and
  // each participant's own registration list
  // team.list is cached now, and the tab refetches straight after each of
  // these — so the roster key has to go with them or the user sees the state
  // they just changed back again.
  "team.createTeam": [
    "hackathon:*:participants",
    "hackathon:*:teams",
    "hackathon:registrations:*",
  ],
  "team.joinTeam": [
    "hackathon:*:participants",
    "hackathon:*:teams",
    "hackathon:registrations:*",
  ],
  "team.leaveTeam": [
    "hackathon:*:participants",
    "hackathon:*:teams",
    "hackathon:registrations:*",
  ],
  "team.disbandTeam": [
    "hackathon:*:participants",
    "hackathon:*:teams",
    "hackathon:registrations:*",
  ],
  // The public gallery is cached per page, so its keys carry a limit/offset
  // suffix that a bare `:projects` pattern would not match.
  "team.submitProject": [
    "hackathon:*:projects",
    "hackathon:*:public-projects*",
    "hackathon:registrations:*",
  ],
  "team.withdrawProject": [
    "hackathon:*:projects",
    "hackathon:*:public-projects*",
  ],
  // Both evict precisely by id in the resolver; empty keeps the namespace
  // fallback from sweeping every attendee's cached registrations.
  "hackathon.adminUpdateProject": [],
  "hackathon.adminWithdrawProject": [],
  // Both evict precisely in the resolver. Left unmapped they fall through to
  // deletePattern("hackathon:*"), which also matches every attendee's cached
  // registrations and the rankings entry — and removeEventAttendance is
  // reachable by a volunteer pressing Undo at a check-in desk.
  "hackathon.removeEventAttendance": [],
  "hackathon.sendMassAcceptanceEmails": [],
  // Publishing and unpublishing change what the public getResults returns.
  "judge.computeResults": ["hackathon:*:results"],
  "judge.publishResults": ["hackathon:*:results"],
  "judge.unpublishResults": ["hackathon:*:results"],
  // Stripe — invalidate member status after linking
  "stripe.attemptAutoLink": ["member:*"],
  "stripe.linkAccount": ["member:*"],
  // Initiatives. Every write moves what BOTH the member list and the leader's
  // queue show, so neither namespace can be evicted on its own.
  "initiative.create": ["initiative:*"],
  "initiative.update": ["initiative:*"],
  "initiative.setStatus": ["initiative:*"],
  "initiative.setArchived": ["initiative:*"],
  "initiative.decide": ["initiative:*"],
  "initiative.requestToJoin": ["initiative:*"],
  "initiative.withdraw": ["initiative:*"],
  "initiative.propose": ["initiative:*"],
  "initiative.withdrawProposal": ["initiative:*"],
  // setLeader and reviewProposal clear the role gate and portal context
  // themselves, by user id — this only sweeps the list caches.
  "initiative.setLeader": ["initiative:*"],
  "initiative.reviewProposal": ["initiative:*"],
  // Events (club check-ins)
  "events.create": ["events:list"],
  "events.delete": ["events:list"],
  "events.toggleCheckIn": ["events:list"],
  "events.checkIn": ["events:list", "member:*"],
};

const cacheInvalidationMiddleware = t.middleware(
  async ({ ctx, next, type, path }) => {
    const result = await next();

    if (type === "mutation" && result.ok) {
      const patterns = CACHE_INVALIDATION_MAP[path];
      if (patterns) {
        for (const pattern of patterns) ctx.cache.deletePattern(pattern);
      } else {
        // Fallback: evict the whole namespace (safe but broad)
        const namespace = path.split(".")[0];
        if (namespace) ctx.cache.deletePattern(`${namespace}:*`);
      }
    }

    return result;
  },
);

export const publicProcedure = t.procedure
  .use(sanitizeInputs)
  .use(enforceContentType)
  .use(async ({ ctx, next, type }) => {
    // Flood protection. Key on the signed-in user when there is one: at a
    // 2000-person venue every attendee shares one NAT address, so an
    // address-keyed bucket blocks the whole building the moment the schedule
    // page gets popular. Prefixes keep the two namespaces from colliding.
    const ddosCheck = ddosProtection(
      ctx.userId ? `user:${ctx.userId}` : `ip:${ctx.clientIp}`,
    );
    if (!ddosCheck.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Please try again in ${ddosCheck.retryAfter} seconds.`,
      });
    }

    const identifier = ctx.userId || `ip-${ctx.clientIp}`;
    const config = RATE_LIMITS.public;
    const tokens =
      type === "mutation" ? config.mutationTokens : config.queryTokens;

    const result = rateLimit(
      identifier,
      config.maxTokens,
      config.refillRate,
      tokens,
    );

    if (!result.allowed) {
      logSecurityEvent({
        type: "rate_limit",
        identifier,
        details: `Public ${type} blocked, retry after ${result.retryAfter}s`,
      });

      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Please try again in ${result.retryAfter} seconds.`,
      });
    }

    return next();
  });

const isAuthed = t.middleware(async ({ ctx, next, type }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }

  const config = RATE_LIMITS.authenticated;
  const tokens =
    type === "mutation" ? config.mutationTokens : config.queryTokens;

  const result = rateLimit(
    `auth-${ctx.userId}`,
    config.maxTokens,
    config.refillRate,
    tokens,
  );

  if (!result.allowed) {
    logSecurityEvent({
      type: "rate_limit",
      identifier: ctx.userId,
      details: `Authenticated ${type} blocked, retry after ${result.retryAfter}s`,
    });

    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many requests. Please try again in ${result.retryAfter} seconds.`,
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

export const protectedProcedure = t.procedure
  .use(requiresDb)
  .use(isAuthed)
  .use(sanitizeInputs)
  .use(enforceContentType)
  .use(cacheInvalidationMiddleware);

export const uploadProcedure = t.procedure
  .use(requiresDb)
  .use(isAuthed)
  .use(uploadSanitizeInputs)
  .use(enforceContentType)
  .use(cacheInvalidationMiddleware);

/*
 * There is deliberately no `adminProcedure` or `judgeProcedure` here.
 *
 * Both used to exist and were byte-for-byte identical to `protectedProcedure` —
 * no role check of any kind. Writing `adminProcedure.mutation(...)`, which is
 * the obvious thing to reach for, shipped an admin endpoint open to every
 * signed-in user, and it typechecked, linted and built cleanly. Neither had a
 * single caller, so the names existed only to be misused.
 *
 * The real gates live in middleware/procedures.ts: `isAdmin` (full staff),
 * `isSuperAdmin`, `isScanner` (volunteers included) and `isJudge`. Use those.
 */
