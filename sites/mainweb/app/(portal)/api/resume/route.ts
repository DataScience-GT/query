import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db, memberResumes } from "@query/db";
import { eq } from "drizzle-orm";
import { cache, rateLimit } from "@query/api";
import { PDFDocument } from "pdf-lib";
import type { DrizzleDB } from "@query/db";
import {
  MAX_RESUME_BYTES,
  looksLikePdf,
  resumeCaller,
} from "@/lib/resume-access";
import {
  deleteResume,
  putResume,
  resumeBucketName,
  resumeStorageKey,
} from "@/lib/resume-storage";

/**
 * Upload and remove your own resume.
 *
 * Not a tRPC procedure: superjson base64s the body and uploadProcedure caps at
 * 2MB, and raising that cap would loosen the avatar path with it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_LIMIT = { maxTokens: 6, refillRate: 6 / 3600 };

const TOO_LARGE = "Resume must be 2MB or smaller.";

export async function POST(request: NextRequest) {
  const { userId } = await resumeCaller();
  if (!userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!resumeBucketName()) {
    return NextResponse.json(
      { error: "Resume storage is not configured. Tell an officer." },
      { status: 503 },
    );
  }

  const limit = rateLimit(
    `resume-upload-${userId}`,
    UPLOAD_LIMIT.maxTokens,
    UPLOAD_LIMIT.refillRate,
    1,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many uploads. Try again in ${limit.retryAfter} seconds.` },
      { status: 429 },
    );
  }

  // A claim, so it only saves buffering an oversized body; checked again below.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());

  if (bytes.length === 0) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (bytes.length > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  }
  if (!looksLikePdf(bytes)) {
    return NextResponse.json(
      { error: "That file is not a PDF." },
      { status: 400 },
    );
  }

  // Lossless re-save: takes 5-15% off a text resume, and refuses a PDF that
  // will not parse here rather than handing a broken file to a sponsor later.
  let stored: Uint8Array;
  try {
    const parsed = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const compact = await parsed.save({ useObjectStreams: true });
    stored = compact.length < bytes.length ? compact : bytes;
  } catch {
    return NextResponse.json(
      {
        error:
          "That PDF could not be read. Try exporting it again, or print it to a new PDF.",
      },
      { status: 400 },
    );
  }

  const fileName = (request.headers.get("x-resume-filename") ?? "resume.pdf")
    .replace(/[\r\n]/g, "")
    .slice(0, 255);

  // Object first. A write that fails leaves the old row pointing at the old
  // object, which is a stale resume — a row pointing at nothing is a 404 on a
  // resume the member believes they uploaded.
  const storageKey = resumeStorageKey(userId);
  try {
    await putResume(storageKey, stored);
  } catch (error) {
    // A missing bucket or a revoked service account is an outage, not a bad
    // file: say so, and leave the detail in the logs rather than throwing the
    // whole Storage error object at the member as a 500.
    console.error("resume upload failed", error);
    return NextResponse.json(
      { error: "Resume storage is unavailable right now. Tell an officer." },
      { status: 502 },
    );
  }

  const record = { storageKey, fileName, sizeBytes: stored.length };

  await (db as DrizzleDB)
    .insert(memberResumes)
    .values({ userId, ...record })
    .onConflictDoUpdate({
      target: memberResumes.userId,
      set: { ...record, uploadedAt: new Date() },
    });

  cache.deletePattern("resume:*");

  return NextResponse.json({
    fileName,
    sizeBytes: stored.length,
    originalBytes: bytes.length,
  });
}

export async function DELETE() {
  const { userId } = await resumeCaller();
  if (!userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [removed] = await (db as DrizzleDB)
    .delete(memberResumes)
    .where(eq(memberResumes.userId, userId))
    .returning({ storageKey: memberResumes.storageKey });

  // Row first, object after: an orphaned object costs pennies, an orphaned row
  // serves a resume the member asked to remove. A storage failure here is the
  // same trade — the row is already gone, so the resume is off the site.
  if (removed) {
    try {
      await deleteResume(removed.storageKey);
    } catch (error) {
      console.error("resume object delete failed", error);
    }
  }

  cache.deletePattern("resume:*");

  return NextResponse.json({ removed: true });
}
