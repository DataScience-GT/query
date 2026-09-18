import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  caller: { userId: "staff", isStaff: true, isEnrolled: false } as {
    userId: string | null;
    isStaff: boolean;
    isEnrolled: boolean;
  },
  bucket: "test-bucket",
  workshop: null as null | {
    id: string;
    term: string;
    week: number;
    isPublished: boolean;
    materialsKey: string | null;
    solutionKey: string | null;
  },
  readError: null as null | (Error & { code?: number }),
  uploadError: null as null | Error,
  updated: true,
  removed: true,
}));

vi.mock("@/lib/bootcamp-access", () => ({
  bootcampCaller: async () => state.caller,
}));

vi.mock("@/lib/bootcamp-file", () => ({
  MAX_BOOTCAMP_ZIP_BYTES: 20 * 1024 * 1024,
  uploadedBootcampFileName: () => "workshop.zip",
  bootcampDownloadName: (week: number, kind: string) =>
    `bootcamp-week-${week}-${kind}.zip`,
}));

vi.mock("@/lib/bootcamp-route-rules", () => ({
  canDownloadBootcampFile: (
    caller: { isStaff: boolean; isEnrolled: boolean },
    workshop: { term: string; isPublished: boolean },
    term: string,
    hasMetadata: boolean,
  ) =>
    hasMetadata &&
    (caller.isStaff ||
      (caller.isEnrolled && workshop.term === term && workshop.isPublished)),
}));

vi.mock("@/lib/bootcamp-storage", () => {
  class BootcampZipError extends Error {
    constructor(
      readonly reason: "empty" | "not-zip" | "too-large",
      message: string,
    ) {
      super(message);
    }
  }

  return {
    BootcampZipError,
    bootcampBucketName: () => state.bucket,
    bootcampStorageKey: (id: string, kind: string) =>
      `bootcamp/${id}/${kind}.zip`,
    putBootcampZip: async () => {
      if (state.uploadError) throw state.uploadError;
      return 4;
    },
    deleteBootcampZip: vi.fn(async () => undefined),
    bootcampReadStream: () => {
      if (!state.readError) return Readable.from([Buffer.from("PK\x03\x04")]);
      return new Readable({
        read() {
          this.destroy(state.readError ?? undefined);
        },
      });
    },
  };
});

vi.mock("@query/api", () => ({
  rateLimit: () => ({ allowed: true }),
}));

vi.mock("@query/db/services/membership", () => ({
  currentTerm: () => "2026-fall",
}));

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

vi.mock("@query/db", () => {
  interface UpdateNode {
    set: () => UpdateNode;
    where: () => UpdateNode;
    returning: () => Promise<{ id: string }[]>;
  }

  interface DeleteNode {
    where: () => DeleteNode;
    returning: () => Promise<{ id: string }[]>;
  }

  const updateNode: UpdateNode = {
    set: () => updateNode,
    where: () => updateNode,
    returning: async () => (state.updated ? [{ id: "workshop" }] : []),
  };
  const deleteNode: DeleteNode = {
    where: () => deleteNode,
    returning: async () => (state.removed ? [{ id: "workshop" }] : []),
  };

  return {
    bootcampWorkshops: {
      id: "id",
      materialsKey: "materials_key",
      solutionKey: "solution_key",
    },
    db: {
      query: {
        bootcampWorkshops: {
          findFirst: async () => state.workshop,
        },
      },
      update: () => updateNode,
      delete: () => deleteNode,
    },
  };
});

import {
  DELETE as clearFile,
  GET as downloadFile,
  POST as uploadFile,
} from "../app/(portal)/api/bootcamp/materials/[workshopId]/[kind]/route";
import { DELETE as deleteWorkshop } from "../app/(portal)/api/bootcamp/materials/[workshopId]/route";

const ID = "44444444-4444-4444-8444-444444444444";
const params = (kind = "materials") =>
  Promise.resolve({ workshopId: ID, kind });

function requireWorkshop() {
  const workshop = state.workshop;
  if (!workshop) {
    throw new Error("Expected the test workshop fixture to be initialized.");
  }
  return workshop;
}

const request = (method: string, body?: Uint8Array, headers?: HeadersInit) =>
  new Request(`http://localhost/api/bootcamp/materials/${ID}/materials`, {
    method,
    body,
    headers,
    // Node requires duplex when a Request carries a streamed body; browsers do
    // not expose this field, so it is test-only construction detail.
    duplex: body ? "half" : undefined,
  } as RequestInit & { duplex?: "half" }) as unknown as NextRequest;

describe("bootcamp material route handlers", () => {
  beforeEach(() => {
    state.caller = { userId: "staff", isStaff: true, isEnrolled: false };
    state.bucket = "test-bucket";
    state.workshop = {
      id: ID,
      term: "2026-fall",
      week: 1,
      isPublished: true,
      materialsKey: `bootcamp/${ID}/materials.zip`,
      solutionKey: null,
    };
    state.readError = null;
    state.uploadError = null;
    state.updated = true;
    state.removed = true;
  });

  it("returns 503 for upload, clear, and download when the bucket is unset", async () => {
    state.bucket = "";

    const [upload, clear, download] = await Promise.all([
      uploadFile(request("POST"), { params: params() }),
      clearFile(request("DELETE"), { params: params() }),
      downloadFile(request("GET"), { params: params() }),
    ]);

    expect([upload.status, clear.status, download.status]).toEqual([
      503, 503, 503,
    ]);
    await expect(upload.json()).resolves.toMatchObject({
      error: expect.stringMatching(/not configured/i),
    });
  });

  it.each(["volunteer", "signed-in non-staff user"])(
    "rejects upload, clear, and workshop deletion for a %s",
    async () => {
      state.caller = {
        userId: "ordinary-user",
        isStaff: false,
        isEnrolled: false,
      };

      const [upload, clear, remove] = await Promise.all([
        uploadFile(request("POST"), { params: params() }),
        clearFile(request("DELETE"), { params: params() }),
        deleteWorkshop(request("DELETE"), {
          params: Promise.resolve({ workshopId: ID }),
        }),
      ]);

      expect([upload.status, clear.status, remove.status]).toEqual([
        403, 403, 403,
      ]);
    },
  );

  it("hides a draft from a member but serves it to staff", async () => {
    requireWorkshop().isPublished = false;
    state.caller = { userId: "member", isStaff: false, isEnrolled: true };
    expect(
      (await downloadFile(request("GET"), { params: params() })).status,
    ).toBe(404);

    state.caller = { userId: "staff", isStaff: true, isEnrolled: false };
    expect(
      (await downloadFile(request("GET"), { params: params() })).status,
    ).toBe(200);
  });

  it("hides wrong-term and missing-metadata files from a member", async () => {
    state.caller = { userId: "member", isStaff: false, isEnrolled: true };
    const workshop = requireWorkshop();
    workshop.term = "2026-spring";
    expect(
      (await downloadFile(request("GET"), { params: params() })).status,
    ).toBe(404);

    workshop.term = "2026-fall";
    workshop.materialsKey = null;
    expect(
      (await downloadFile(request("GET"), { params: params() })).status,
    ).toBe(404);
  });

  it("distinguishes a missing object from a storage outage", async () => {
    state.readError = Object.assign(new Error("missing"), { code: 404 });
    expect(
      (await downloadFile(request("GET"), { params: params() })).status,
    ).toBe(404);

    state.readError = Object.assign(new Error("offline"), { code: 503 });
    expect(
      (await downloadFile(request("GET"), { params: params() })).status,
    ).toBe(502);
  });

  it("rejects a declared oversized upload before reading it", async () => {
    const response = await uploadFile(
      request("POST", undefined, { "content-length": String(21 * 1024 * 1024) }),
      { params: params() },
    );
    expect(response.status).toBe(413);
  });

  it.each([
    ["not-zip", 400],
    ["too-large", 413],
  ] as const)("maps a streamed %s rejection", async (reason, status) => {
    const { BootcampZipError } = await import("@/lib/bootcamp-storage");
    state.uploadError = new BootcampZipError(
      reason,
      reason === "not-zip" ? "That file is not a ZIP." : "Too large.",
    );

    const response = await uploadFile(
      request("POST", new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
      { params: params() },
    );
    expect(response.status).toBe(status);
  });
});
