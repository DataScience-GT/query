import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { bootcampWorkshops, db } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { eq } from "drizzle-orm";
import { rateLimit } from "@query/api";
import { currentTerm } from "@query/db/services/membership";
import { bootcampCaller } from "@/lib/bootcamp-access";
import { canDownloadBootcampFile } from "@/lib/bootcamp-route-rules";
import {
  bootcampDownloadName,
  MAX_BOOTCAMP_ZIP_BYTES,
  uploadedBootcampFileName,
} from "@/lib/bootcamp-file";
import {
  BootcampZipError,
  bootcampBucketName,
  bootcampReadStream,
  bootcampStorageKey,
  deleteBootcampZip,
  putBootcampZip,
} from "@/lib/bootcamp-storage";

/** ZIP bytes stay outside tRPC so they are streamed rather than base64 encoded. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Kind = "materials" | "solution";

const isKind = (value: string): value is Kind =>
  value === "materials" || value === "solution";

const storageUnavailable = () =>
  NextResponse.json(
    { error: "Bootcamp storage is not configured. Tell an officer." },
    { status: 503 },
  );

const notFound = () =>
  NextResponse.json({ error: "Not found" }, { status: 404 });

/** All file methods are bounded per signed-in user, not per shared IP. */
const fileRateLimit = (userId: string) =>
  rateLimit(`bootcamp-file-${userId}`, 30, 30 / 3600, 1);

async function context(
  params: Promise<{ workshopId: string; kind: string }>,
) {
  const route = await params;
  const caller = await bootcampCaller();
  return { ...route, caller };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workshopId: string; kind: string }> },
) {
  const { workshopId, kind, caller } = await context(params);
  if (!caller.userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!caller.isStaff) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (!isKind(kind)) return notFound();
  if (!bootcampBucketName()) return storageUnavailable();

  const limit = fileRateLimit(caller.userId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many file requests. Try again in ${limit.retryAfter} seconds.` },
      { status: 429 },
    );
  }

  const declaredHeader = request.headers.get("content-length");
  const declared = declaredHeader === null ? null : Number(declaredHeader);
  if (declared !== null && (!Number.isFinite(declared) || declared < 1)) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (declared !== null && declared > MAX_BOOTCAMP_ZIP_BYTES) {
    return NextResponse.json(
      { error: "Workshop ZIP must be 20MB or smaller." },
      { status: 413 },
    );
  }
  if (!request.body) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }

  const workshop = await (db as DrizzleDB).query.bootcampWorkshops.findFirst({
    where: eq(bootcampWorkshops.id, workshopId),
    columns: { id: true },
  });
  if (!workshop) return notFound();

  const storageKey = bootcampStorageKey(workshopId, kind);
  let sizeBytes: number;
  try {
    sizeBytes = await putBootcampZip(storageKey, request.body);
  } catch (error) {
    if (error instanceof BootcampZipError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.reason === "too-large" ? 413 : 400 },
      );
    }
    console.error("bootcamp upload failed", error);
    return NextResponse.json(
      { error: "Bootcamp storage is unavailable right now." },
      { status: 502 },
    );
  }

  const fileName = uploadedBootcampFileName(
    request.headers.get("x-bootcamp-filename"),
  );
  const metadata =
    kind === "materials"
      ? {
          materialsKey: storageKey,
          materialsFileName: fileName,
          materialsSizeBytes: sizeBytes,
        }
      : {
          solutionKey: storageKey,
          solutionFileName: fileName,
          solutionSizeBytes: sizeBytes,
        };

  const [updated] = await (db as DrizzleDB)
    .update(bootcampWorkshops)
    .set({ ...metadata, updatedAt: new Date() })
    .where(eq(bootcampWorkshops.id, workshopId))
    .returning({ id: bootcampWorkshops.id });

  if (!updated) {
    await deleteBootcampZip(storageKey).catch(() => undefined);
    return notFound();
  }

  return NextResponse.json({ fileName, sizeBytes });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workshopId: string; kind: string }> },
) {
  const { workshopId, kind, caller } = await context(params);
  if (!caller.userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!caller.isStaff) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (!isKind(kind)) return notFound();
  if (!bootcampBucketName()) return storageUnavailable();

  const limit = fileRateLimit(caller.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many file requests." }, { status: 429 });
  }

  const [updated] = await (db as DrizzleDB)
    .update(bootcampWorkshops)
    .set(
      kind === "materials"
        ? {
            materialsKey: null,
            materialsFileName: null,
            materialsSizeBytes: null,
            updatedAt: new Date(),
          }
        : {
            solutionKey: null,
            solutionFileName: null,
            solutionSizeBytes: null,
            updatedAt: new Date(),
          },
    )
    .where(eq(bootcampWorkshops.id, workshopId))
    .returning({ id: bootcampWorkshops.id });

  if (!updated) return notFound();

  // Metadata disappears first so a failed object delete leaves an inert orphan,
  // never a row that offers a file the caller explicitly removed.
  try {
    await deleteBootcampZip(bootcampStorageKey(workshopId, kind));
  } catch (error) {
    console.error("bootcamp object delete failed", error);
    return NextResponse.json(
      { error: "The file was cleared, but storage cleanup failed." },
      { status: 502 },
    );
  }

  return NextResponse.json({ removed: true });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workshopId: string; kind: string }> },
) {
  const { workshopId, kind, caller } = await context(params);
  if (!caller.userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!isKind(kind)) return notFound();
  if (!bootcampBucketName()) return storageUnavailable();

  const limit = fileRateLimit(caller.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many file requests." }, { status: 429 });
  }

  const workshop = await (db as DrizzleDB).query.bootcampWorkshops.findFirst({
    where: eq(bootcampWorkshops.id, workshopId),
  });
  if (!workshop) return notFound();

  const storageKey =
    kind === "materials" ? workshop.materialsKey : workshop.solutionKey;
  // Staff may inspect every term and draft. Members get a deliberately opaque
  // 404 unless enrolment, current term, publication, and metadata all agree.
  if (
    !storageKey ||
    !canDownloadBootcampFile(
      caller,
      workshop,
      currentTerm(),
      true,
    )
  ) {
    return notFound();
  }

  const source = bootcampReadStream(storageKey);
  const iterator = source[Symbol.asyncIterator]();
  let first: IteratorResult<unknown>;
  try {
    first = await iterator.next();
  } catch (error) {
    if (String((error as { code?: number | string }).code) === "404") {
      return notFound();
    }
    console.error("bootcamp read failed", error);
    return NextResponse.json(
      { error: "Bootcamp storage is unavailable right now." },
      { status: 502 },
    );
  }
  if (first.done) return notFound();

  // Pull one chunk before committing headers so a missing object is a clean
  // 404 and a storage outage is a 502 rather than a corrupt successful ZIP.
  const proxied = Readable.from(
    (async function* () {
      yield first.value;
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        yield next.value;
      }
    })(),
  );

  return new NextResponse(
    Readable.toWeb(proxied) as ReadableStream<Uint8Array>,
    {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${bootcampDownloadName(workshop.week, kind)}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
