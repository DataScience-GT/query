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
import { trpcDuration } from "./services/metrics";

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

// Times every procedure. Outermost on purpose: a request the rate limiter
// rejects is still a request, and cheap rejections spiking is the shape of an
// incident. `path` is a fixed set, so no unbounded label values.
const recordDuration = t.middleware(async ({ next, path, type }) => {
  const stop = trpcDuration.startTimer({ procedure: path, type });
  const result = await next();
  stop({ ok: String(result.ok) });
  return result;
});

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

// Dangerous markup is REJECTED, never rewritten. An HTML parser run over
// prose is destructive: "picks the class where loss<threshold, then retrains"
// would be stored as "picks the class where loss". The bar is "could this
// execute somewhere", not "looks like HTML", so `vector<int>` survives.
// Tag names that could execute if they reached an HTML sink. Linear scan,
// not a regex: the old patterns were polynomial in attacker-controlled input
// (CodeQL #804/#805), and a hackathon-sized payload stalled the instance.
const DANGEROUS_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "svg",
  "math",
  "style",
  "form",
  "input",
  "button",
  "img",
  "video",
  "audio",
  "source",
  "track",
  "template",
  "noscript",
  "textarea",
  "xmp",
  "frame",
  "frameset",
  "applet",
] as const;

const isHtmlSpace = (ch: string) =>
  ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";

const isAsciiLetter = (ch: string) =>
  (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");

const isNameBoundary = (ch: string | undefined) => {
  if (ch === undefined) return true;
  const c = ch.toLowerCase();
  return !(
    (c >= "a" && c <= "z") ||
    (c >= "0" && c <= "9") ||
    c === "-"
  );
};

// `onerror=` only counts inside a tag — matched loosely it would reject prose
// like "onboarding = great". Word boundary as before: `/` counts, letters and
// digits do not. `end` is bounded, so this is linear in a small window.
const isWordChar = (ch: string) =>
  (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "_";

const hasInlineHandler = (lower: string, start: number, end: number) => {
  let pos = start;
  while (pos < end) {
    const on = lower.indexOf("on", pos);
    if (on === -1 || on >= end) return false;
    if (on > start && isWordChar(lower[on - 1]!)) {
      pos = on + 1;
      continue;
    }
    let k = on + 2;
    let n = 0;
    while (k < end && n < 32) {
      const ch = lower[k]!;
      if (ch < "a" || ch > "z") break;
      k += 1;
      n += 1;
    }
    if (n === 0) {
      pos = on + 1;
      continue;
    }
    while (k < end && isHtmlSpace(lower[k]!)) k += 1;
    if (k < end && lower[k] === "=") return true;
    pos = on + 1;
  }
  return false;
};

// True when the string could execute at an HTML sink. `javascript:` is a
// case-insensitive substring; tags and handlers are found by walking `<`…`>`,
// so long runs of spaces cannot force backtracking.
export const hasDangerousMarkup = (value: string): boolean => {
  // Nothing below can fire without a `<` or a `:`: the scheme check needs the
  // colon and every tag and handler check starts from an angle bracket. The
  // strings that carry neither are most of every payload, and they were each
  // paying a full lowercase copy of themselves to be cleared.
  if (!value.includes("<") && !value.includes(":")) return false;

  const lower = value.toLowerCase();
  if (lower.includes("javascript:")) return true;

  for (let i = 0; i < lower.length; i += 1) {
    if (lower[i] !== "<") continue;

    let j = i + 1;
    while (j < lower.length && isHtmlSpace(lower[j]!)) j += 1;
    if (j < lower.length && lower[j] === "/") {
      j += 1;
      while (j < lower.length && isHtmlSpace(lower[j]!)) j += 1;
    }
    for (const tag of DANGEROUS_TAGS) {
      if (lower.startsWith(tag, j) && isNameBoundary(lower[j + tag.length])) {
        return true;
      }
    }

    // Original handler regex required a letter immediately after `<`.
    if (i + 1 < lower.length && isAsciiLetter(lower[i + 1]!)) {
      const gt = lower.indexOf(">", i + 1);
      const end = gt === -1 ? Math.min(lower.length, i + 2048) : gt;
      if (hasInlineHandler(lower, i, end)) return true;
    }
  }

  return false;
};

const isPlainObject = (value: object) => {
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
};

// Rejects executable markup anywhere in a payload and rebuilds the object so
// prototype-polluting keys cannot ride along. Strings pass through byte for
// byte (prose must survive); Date, Buffer and friends are handed on as-is so
// the procedure's own validator still sees them.
// Ceiling on any array reaching a procedure, checked before zod. Must stay at
// or above the largest bound any input schema declares, or that schema is
// unreachable — at 500 it made approving a 2000-person roster impossible.
// Not the payload guard; request size is bounded by validateRequestSize.
const MAX_ARRAY_LENGTH = 2500;

// Exported so the suite tests the sanitizer the product actually runs. The
// old `sanitizeInput` in middleware/security.ts stripped markup instead of
// refusing it, had no caller, and was what every sanitizer test asserted on.
export const scrubMarkup = (input: unknown, depth = 0): unknown => {
  if (depth > 10) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Input too deeply nested",
    });
  }

  if (typeof input === "string") {
    if (hasDangerousMarkup(input)) {
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

  // Validator and resolver both read input through getRawInput, so replacing it
  // here is what makes the scrubbed value the one that is stored.
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

    // Skips scrubMarkup: it truncates strings over 10,000 characters and base64
    // is far larger. The zod validator still checks the data URI structure.

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

// Surgical invalidation: each mutation path maps to the exact key patterns it
// should evict. Unmapped routes fall back to namespace-level eviction.
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
  // A badge scan changes one event's attendee count, not the roster; the
  // resolver evicts that key by id. Empty rather than absent, so the namespace
  // fallback cannot wipe every attendee's registrations at every door.
  "hackathon.scanParticipantPass": [],
  // `hackathons:list*`, not `hackathons:list`: deletePattern anchors with `$`,
  // and every real key carries a viewer/status/limit suffix. With an entry
  // present the namespace fallback is skipped, so nothing was evicted at all.
  "hackathon.create": ["hackathons:list*"],
  "hackathon.update": ["hackathons:list*", "hackathon:*"],
  "hackathon.delete": ["hackathons:list*", "hackathon:*"],
  "hackathon.createEvent": ["hackathon:*:events"],
  "hackathon.updateEvent": ["hackathon:*:events"],
  "hackathon.deleteEvent": ["hackathon:*:events"],
  // Both writes move the admin list and the caller's own "am I on it" answer,
  // and the two are read from the same namespace.
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
  // Promotion creates judgeable projects and flips submissions to "judging", so
  // the public project list and the rankings view both move.
  "judge.promoteSubmissions": [
    "hackathon:*:projects",
    "hackathon:*:public-projects*",
    "hackathon:*:rankings",
  ],
  // Announcements write their own rows and nothing cacheable. Empty rather than
  // absent, so this cannot sweep the whole hackathon namespace.
  "hackathon.createAnnouncement": [],
  "hackathon.sendBatch": [],
  // Same: the marker lives on hackathon_interest, which is not cached, and the
  // admin list is read fresh.
  "hackathon.notifyRegistrationOpen": [],
  "judge.assignToHackathon": ["judge:*"],
  // Member mutations
  "member.update": ["member:*", "user:*:profile"],
  // Renewal moves the membership the portal reads, so its context goes too.
  // Team mutations: membership is embedded in the public roster and in each
  // participant's registration list, and the tab refetches straight after.
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
  // registrations — and a volunteer pressing Undo reaches this.
  "hackathon.removeEventAttendance": [],
  "hackathon.sendMassAcceptanceEmails": [],
  // Publishing and unpublishing change what the public getResults returns.
  "judge.computeResults": ["hackathon:*:results"],
  "judge.publishResults": ["hackathon:*:results"],
  "judge.unpublishResults": ["hackathon:*:results"],
  // Stripe — invalidate member status after linking
  "stripe.attemptAutoLink": ["member:*"],
  "stripe.linkAccount": ["member:*"],
  // Every initiative write moves what both the member list and the leader's
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
  // setLeader and reviewProposal clear the role gate and portal context by user
  // id themselves; this only sweeps the list caches.
  "initiative.setLeader": ["initiative:*"],
  "initiative.reviewProposal": ["initiative:*"],
  // Same wildcard rule as the hackathon list — the real keys are
  // `events:list:all` and `events:list:public`.
  "events.create": ["events:list*"],
  "events.update": ["events:list*", "event:*"],
  "events.delete": ["events:list*"],
  "events.toggleCheckIn": ["events:list*"],
  // A scan changes the caller's own attendance, cached per user for 60s —
  // without these the member who just scanned sees no change and scans again.
  "events.checkIn": ["events:list*", "events:my*", "events:stats*", "member:*"],
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

// `requiresDb` first, exactly as on the authenticated procedures. Without it
// a public query with no database fell through to its own `if (!db)` branch
// returning null, so a misconfigured deploy looked empty, not broken.
export const publicProcedure = t.procedure
  .use(recordDuration)
  .use(requiresDb)
  .use(sanitizeInputs)
  .use(enforceContentType)
  .use(async ({ ctx, next, type }) => {
    // Flood protection, keyed on the signed-in user when there is one: at a
    // 2000-person venue everyone shares one NAT address, so an address-keyed
    // bucket blocks the building. Prefixes keep the namespaces from colliding.
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
  .use(recordDuration)
  .use(requiresDb)
  .use(isAuthed)
  .use(sanitizeInputs)
  .use(enforceContentType)
  .use(cacheInvalidationMiddleware);

export const uploadProcedure = t.procedure
  .use(recordDuration)
  .use(requiresDb)
  .use(isAuthed)
  .use(uploadSanitizeInputs)
  .use(enforceContentType)
  .use(cacheInvalidationMiddleware);

// No `adminProcedure` or `judgeProcedure` here. Both existed and were
// identical to `protectedProcedure` — no role check — so the obvious call
// shipped an admin endpoint open to every signed-in user, and it built
// cleanly. The real gates are in middleware/procedures.ts: isAdmin,
// isSuperAdmin, isScanner (volunteers included) and isJudge.
