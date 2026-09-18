import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";

// The handlers live under `app/`, which the root test script does not glob, so
// the test sits here. Every refusal matters more than the happy path: each one
// is the only thing between a private bucket and a file leaving it.

type Caller = { userId: string | null; isStaff: boolean };

let caller: Caller = { userId: "user_staff", isStaff: true };
let bucket = "dsgt-bootcamp";
let allowed = true;
let material: Record<string, unknown> | null = null;
let sessionRow: { id: string; bootcampTerm: string | null } | undefined;
let deleted: { storageKey: string }[] = [];

const putMaterial = vi.fn();
const deleteMaterial = vi.fn();
const materialReadStream = vi.fn();
const inserted = vi.fn();

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock("@query/api", () => ({
  // The limiter has its own tests and must never be why a case here passes.
  rateLimit: () => ({ allowed: true, retryAfter: 0 }),
}));

vi.mock("@query/db", () => ({
  db: {
    query: { events: { findFirst: () => Promise.resolve(sessionRow) } },
    insert: () => ({ values: (row: unknown) => inserted(row) }),
    delete: () => ({
      where: () => ({ returning: () => Promise.resolve(deleted) }),
    }),
  },
  bootcampMaterials: { id: "id", storageKey: "storage_key" },
  events: { id: "id" },
}));

vi.mock("./bootcamp-access", () => ({
  portalCaller: () => Promise.resolve(caller),
  loadMaterial: () => Promise.resolve(material),
  enrolledInTerm: () => Promise.resolve(allowed),
}));

vi.mock("./bootcamp-storage", () => ({
  bootcampBucketName: () => bucket,
  putMaterial: (...args: unknown[]) => putMaterial(...args),
  deleteMaterial: (...args: unknown[]) => deleteMaterial(...args),
  materialReadStream: (...args: unknown[]) => materialReadStream(...args),
}));

const { POST } = await import("../app/(portal)/api/bootcamp/materials/route");
const { GET, DELETE } = await import(
  "../app/(portal)/api/bootcamp/materials/[id]/route"
);

const EVENT = "11111111-1111-4111-8111-111111111111";

/** An upload as the browser sends it: raw bytes, name and session in headers. */
function uploadRequest(
  fileName: string,
  bytes: Uint8Array,
  overrides: Record<string, string> = {},
) {
  return new Request("https://example.test/api/bootcamp/materials", {
    method: "POST",
    headers: {
      "content-length": String(bytes.length),
      "x-material-event": EVENT,
      "x-material-filename": encodeURIComponent(fileName),
      ...overrides,
    },
    body: bytes,
    duplex: "half",
  } as RequestInit) as never;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  caller = { userId: "user_staff", isStaff: true };
  bucket = "dsgt-bootcamp";
  allowed = true;
  material = null;
  sessionRow = { id: EVENT, bootcampTerm: "2026-fall" };
  deleted = [];
  inserted.mockResolvedValue(undefined);
  putMaterial.mockResolvedValue(undefined);
  deleteMaterial.mockResolvedValue(undefined);
});

describe("POST /api/bootcamp/materials", () => {
  const pdf = new Uint8Array([1, 2, 3, 4]);

  it("refuses somebody who is not signed in", async () => {
    caller = { userId: null, isStaff: false };

    const response = await POST(uploadRequest("week1.pdf", pdf));

    expect(response.status).toBe(401);
    expect(putMaterial).not.toHaveBeenCalled();
  });

  it("answers a signed-in member with 404, not 403", async () => {
    caller = { userId: "user_member", isStaff: false };

    const response = await POST(uploadRequest("week1.pdf", pdf));

    expect(response.status).toBe(404);
    expect(putMaterial).not.toHaveBeenCalled();
  });

  it("says so plainly when the bucket is not configured", async () => {
    bucket = "";

    const response = await POST(uploadRequest("week1.pdf", pdf));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("BOOTCAMP_BUCKET"),
    });
  });

  it("refuses a kind of file it has no content type for", async () => {
    const response = await POST(uploadRequest("payload.html", pdf));

    expect(response.status).toBe(400);
    expect(putMaterial).not.toHaveBeenCalled();
  });

  it("refuses a file for a session that does not exist", async () => {
    sessionRow = undefined;

    const response = await POST(uploadRequest("week1.pdf", pdf));

    expect(response.status).toBe(404);
    expect(putMaterial).not.toHaveBeenCalled();
  });

  it("refuses a file on an event that is not a bootcamp session", async () => {
    // Unreachable: the download gate asks which term paid for it.
    sessionRow = { id: EVENT, bootcampTerm: null };

    const response = await POST(uploadRequest("week1.pdf", pdf));

    expect(response.status).toBe(400);
    expect(putMaterial).not.toHaveBeenCalled();
  });

  it("refuses an oversized upload on its claim, before reading it", async () => {
    const response = await POST(
      uploadRequest("week1.pdf", pdf, {
        "content-length": String(26 * 1024 * 1024),
      }),
    );

    expect(response.status).toBe(413);
    expect(putMaterial).not.toHaveBeenCalled();
  });

  it("refuses a body it was told nothing about", async () => {
    const response = await POST(
      uploadRequest("week1.pdf", pdf, { "content-length": "0" }),
    );

    expect(response.status).toBe(400);
  });

  it("writes the object before the row, keyed by id and not by filename", async () => {
    const response = await POST(uploadRequest("Week 1 Slides.pdf", pdf));

    expect(response.status).toBe(200);

    const body = (await response.json()) as { id: string };
    const [key, bytes, contentType] = putMaterial.mock.calls[0] as [
      string,
      Uint8Array,
      string,
    ];

    expect(key).toBe(`sessions/${EVENT}/${body.id}.pdf`);
    expect(contentType).toBe("application/pdf");
    expect(bytes.length).toBe(pdf.length);

    expect(inserted).toHaveBeenCalledWith(
      expect.objectContaining({
        id: body.id,
        eventId: EVENT,
        storageKey: key,
        fileName: "Week 1 Slides.pdf",
        contentType: "application/pdf",
        sizeBytes: pdf.length,
        uploadedById: "user_staff",
      }),
    );

    // A row pointing at no object is a 404 on a file the cohort expects.
    expect(putMaterial.mock.invocationCallOrder[0]).toBeLessThan(
      inserted.mock.invocationCallOrder[0] as number,
    );
  });

  it("records nothing when the bucket write fails", async () => {
    putMaterial.mockRejectedValue(new Error("no such bucket"));

    const response = await POST(uploadRequest("week1.pdf", pdf));

    expect(response.status).toBe(502);
    expect(inserted).not.toHaveBeenCalled();
  });
});

describe("GET /api/bootcamp/materials/[id]", () => {
  const stored = {
    id: "mat-1",
    eventId: EVENT,
    storageKey: `sessions/${EVENT}/mat-1.pdf`,
    fileName: "week1.pdf",
    contentType: "application/pdf",
    sizeBytes: 4,
    term: "2026-fall",
  };

  beforeEach(() => {
    material = stored;
    materialReadStream.mockImplementation(() =>
      Readable.from([Buffer.from([1, 2, 3, 4])]),
    );
  });

  it("refuses somebody who is not signed in", async () => {
    caller = { userId: null, isStaff: false };

    const response = await GET(new Request("https://x.test"), params("mat-1"));

    expect(response.status).toBe(401);
    expect(materialReadStream).not.toHaveBeenCalled();
  });

  it("is 404 for a file that does not exist", async () => {
    material = null;

    const response = await GET(new Request("https://x.test"), params("nope"));

    expect(response.status).toBe(404);
  });

  it("is 404 — not 403 — for a member who did not buy that bootcamp", async () => {
    caller = { userId: "user_member", isStaff: false };
    allowed = false;

    const response = await GET(new Request("https://x.test"), params("mat-1"));

    expect(response.status).toBe(404);
    // Refused before the bucket is touched.
    expect(materialReadStream).not.toHaveBeenCalled();
  });

  it("serves the cohort that bought it", async () => {
    caller = { userId: "user_member", isStaff: false };
    allowed = true;

    const response = await GET(new Request("https://x.test"), params("mat-1"));

    expect(response.status).toBe(200);
    expect(materialReadStream).toHaveBeenCalledWith(stored.storageKey);
    await expect(response.arrayBuffer()).resolves.toHaveProperty(
      "byteLength",
      4,
    );
  });

  it("serves staff who never bought anything", async () => {
    caller = { userId: "user_staff", isStaff: true };
    allowed = false;

    const response = await GET(new Request("https://x.test"), params("mat-1"));

    expect(response.status).toBe(200);
  });

  it("hands the file over as a download, not as a page", async () => {
    const response = await GET(new Request("https://x.test"), params("mat-1"));

    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    // No proxy cache: the next reader may not be allowed it.
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("says so plainly when the bucket is not configured", async () => {
    bucket = "";

    const response = await GET(new Request("https://x.test"), params("mat-1"));

    expect(response.status).toBe(503);
  });
});

describe("DELETE /api/bootcamp/materials/[id]", () => {
  it("refuses a member", async () => {
    caller = { userId: "user_member", isStaff: false };

    const response = await DELETE(
      new Request("https://x.test", { method: "DELETE" }),
      params("mat-1"),
    );

    expect(response.status).toBe(404);
    expect(deleteMaterial).not.toHaveBeenCalled();
  });

  it("is 404 when there is no such row", async () => {
    deleted = [];

    const response = await DELETE(
      new Request("https://x.test", { method: "DELETE" }),
      params("mat-1"),
    );

    expect(response.status).toBe(404);
    expect(deleteMaterial).not.toHaveBeenCalled();
  });

  it("removes the row, then the object it pointed at", async () => {
    deleted = [{ storageKey: `sessions/${EVENT}/mat-1.pdf` }];

    const response = await DELETE(
      new Request("https://x.test", { method: "DELETE" }),
      params("mat-1"),
    );

    expect(response.status).toBe(200);
    expect(deleteMaterial).toHaveBeenCalledWith(`sessions/${EVENT}/mat-1.pdf`);
  });

  it("still reports the removal when the object will not delete", async () => {
    // The row is already gone; a retry would delete nothing and fail forever.
    deleted = [{ storageKey: `sessions/${EVENT}/mat-1.pdf` }];
    deleteMaterial.mockRejectedValue(new Error("permission denied"));

    const response = await DELETE(
      new Request("https://x.test", { method: "DELETE" }),
      params("mat-1"),
    );

    expect(response.status).toBe(200);
  });
});
