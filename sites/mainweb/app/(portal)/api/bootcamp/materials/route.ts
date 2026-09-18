import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db, bootcampMaterials, events } from "@query/db";
import { eq } from "drizzle-orm";
import { rateLimit } from "@query/api";
import type { DrizzleDB } from "@query/db";
import { portalCaller } from "@/lib/bootcamp-access";
import {
  MAX_MATERIAL_BYTES,
  materialContentType,
  materialFileName,
  materialStorageKey,
} from "@/lib/bootcamp-materials";
import { bootcampBucketName, putMaterial } from "@/lib/bootcamp-storage";

/**
 * Attach a file to a bootcamp session. Staff only.
 *
 * Not a tRPC procedure: superjson base64s the body and the upload procedure
 * caps well below a slide deck.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_LIMIT = { maxTokens: 30, refillRate: 30 / 3600 };

const TOO_LARGE = "That file is larger than 25MB.";

export async function POST(request: NextRequest) {
  const caller = await portalCaller();
  if (!caller.userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!caller.isStaff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!bootcampBucketName()) {
    return NextResponse.json(
      { error: "Bootcamp storage is not configured. Set BOOTCAMP_BUCKET." },
      { status: 503 },
    );
  }

  const limit = rateLimit(
    `bootcamp-material-${caller.userId}`,
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

  const eventId = request.headers.get("x-material-event")?.trim() ?? "";
  if (!eventId) {
    return NextResponse.json({ error: "No session given." }, { status: 400 });
  }

  const fileName = materialFileName(request.headers.get("x-material-filename"));
  const contentType = materialContentType(fileName);
  if (!contentType) {
    return NextResponse.json(
      {
        error:
          "That kind of file cannot be handed out. Use a PDF, notebook, script, dataset, archive, Office file or image.",
      },
      { status: 400 },
    );
  }

  // A file on an ordinary event would be unreachable: the download gate asks
  // which bootcamp term paid for it, and such an event has none.
  const session = await (db as DrizzleDB).query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, bootcampTerm: true },
  });
  if (!session) {
    return NextResponse.json({ error: "No such session." }, { status: 404 });
  }
  if (!session.bootcampTerm) {
    return NextResponse.json(
      { error: "That event is not a bootcamp session." },
      { status: 400 },
    );
  }

  // Required, so a missing length cannot turn into an unbounded read.
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared < 1) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (declared > MAX_MATERIAL_BYTES) {
    return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (bytes.length > MAX_MATERIAL_BYTES) {
    return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  }

  const id = crypto.randomUUID();
  const storageKey = materialStorageKey(session.id, id, fileName);

  // Object first: a row pointing at nothing is a 404 on a file the cohort was
  // told to expect, while an object with no row costs a few cents.
  try {
    await putMaterial(storageKey, bytes, contentType);
  } catch (error) {
    console.error("bootcamp material upload failed", error);
    return NextResponse.json(
      { error: "Bootcamp storage is unavailable right now." },
      { status: 502 },
    );
  }

  await (db as DrizzleDB).insert(bootcampMaterials).values({
    id,
    eventId: session.id,
    storageKey,
    fileName,
    contentType,
    sizeBytes: bytes.length,
    uploadedById: caller.userId,
  });

  return NextResponse.json({
    id,
    fileName,
    contentType,
    sizeBytes: bytes.length,
  });
}
