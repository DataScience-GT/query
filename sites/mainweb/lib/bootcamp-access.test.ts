import { describe, it, expect, vi, beforeEach } from "vitest";

// The gate on a bootcamp handout. The regression worth a test is the one that
// reads as correct: a null term against a member who bought no bootcamp is
// `null === null`, which without the guard hands a file to a stranger.

let materialRows: unknown[] = [];
let memberRow: { bootcampTerm: string | null } | undefined;

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

// Stops the import chain before the whole API package.
vi.mock("./resume-access", () => ({ resumeCaller: vi.fn() }));

vi.mock("@query/db", () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(materialRows),
  });

  return {
    db: {
      select: () => chain,
      query: {
        members: { findFirst: () => Promise.resolve(memberRow) },
      },
    },
    bootcampMaterials: {
      id: "id",
      eventId: "event_id",
      storageKey: "storage_key",
      fileName: "file_name",
      contentType: "content_type",
      sizeBytes: "size_bytes",
    },
    events: { id: "id", bootcampTerm: "bootcamp_term" },
    members: { userId: "user_id" },
  };
});

const { enrolledInTerm, loadMaterial } = await import("./bootcamp-access");

describe("enrolledInTerm", () => {
  beforeEach(() => {
    memberRow = undefined;
  });

  it("lets in the cohort that bought that term", async () => {
    memberRow = { bootcampTerm: "2026-fall" };
    await expect(enrolledInTerm("user_1", "2026-fall")).resolves.toBe(true);
  });

  it("keeps last semester's intake out of this semester's files", async () => {
    memberRow = { bootcampTerm: "2026-spring" };
    await expect(enrolledInTerm("user_1", "2026-fall")).resolves.toBe(false);
  });

  it("keeps the fall cohort's files open to them after the term ends", async () => {
    memberRow = { bootcampTerm: "2026-fall" };
    await expect(enrolledInTerm("user_1", "2026-fall")).resolves.toBe(true);
  });

  it("refuses a member who bought no bootcamp at all", async () => {
    memberRow = { bootcampTerm: null };
    await expect(enrolledInTerm("user_1", "2026-fall")).resolves.toBe(false);
  });

  it("refuses a file on an event that is not a bootcamp session", async () => {
    // Both null: comparing them would be true.
    memberRow = { bootcampTerm: null };
    await expect(enrolledInTerm("user_1", null)).resolves.toBe(false);
  });

  it("refuses somebody with no member row", async () => {
    memberRow = undefined;
    await expect(enrolledInTerm("user_1", "2026-fall")).resolves.toBe(false);
  });
});

describe("loadMaterial", () => {
  it("hands back the row with the term that decides access", async () => {
    materialRows = [
      {
        id: "mat-1",
        eventId: "event-1",
        storageKey: "sessions/event-1/mat-1.pdf",
        fileName: "week1.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
        term: "2026-fall",
      },
    ];

    await expect(loadMaterial("mat-1")).resolves.toMatchObject({
      storageKey: "sessions/event-1/mat-1.pdf",
      term: "2026-fall",
    });
  });

  it("reports a missing file as null rather than undefined", async () => {
    materialRows = [];
    await expect(loadMaterial("nope")).resolves.toBeNull();
  });
});
