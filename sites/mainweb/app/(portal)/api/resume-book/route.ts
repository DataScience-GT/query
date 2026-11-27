import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { db } from "@query/db";
import { BURST_LIMITS, rateLimitShared } from "@query/api";
import { listResumes, parseResumeBookIds } from "@query/api/resume-list";
import type { DrizzleDB } from "@query/db";
import { csvCell } from "@/lib/csv";
import { staffCaller } from "@/lib/staff-caller";
import { uniqueZipName } from "@/lib/resume-file";
import { readResume, resumeBucketName } from "@/lib/resume-storage";

/**
 * The resume book: every matching resume as one ZIP, streamed.
 *
 * Not a merged PDF. 5000 resumes is ~7500 pages and 1.5 GB — it does not fit
 * in a 1 GB container and nobody opens it. A ZIP streams out at whatever rate
 * the client reads, so peak memory is the prefetch window below, not the book.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reads run ahead of the writer so the ZIP is not waiting on one round trip at
// a time; the archive is fed serially so entries never queue up in memory.
// Peak held bytes is roughly PREFETCH x the 2MB per-file cap.
const PREFETCH = 8;

/** Resolves only for this entry, so index.csv cannot satisfy a PDF wait. */
function waitForNamedEntry(archive: ZipArchive, name: string) {
  return new Promise<void>((resolve, reject) => {
    const onEntry = (entry: { name?: string }) => {
      if (entry?.name !== name) return;
      archive.off("entry", onEntry);
      archive.off("error", onError);
      resolve();
    };
    const onError = (error: Error) => {
      archive.off("entry", onEntry);
      reject(error);
    };
    archive.on("entry", onEntry);
    archive.once("error", onError);
  });
}

/**
 * GET, not POST: the browser downloads it by navigating, so a 1.5 GB book
 * streams to disk. Fetching it would put the whole thing in a Blob in the tab
 * first. Nothing here writes, so a read over GET is what it looks like.
 */
export async function GET(request: NextRequest) {
  // Another site could otherwise navigate a staff browser here and start the
  // multi-GB stream. A click inside the app sends same-origin, a typed URL or
  // bookmark sends none; non-browser clients send no header at all and still
  // need a session cookie, so absent is allowed.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const caller = await staffCaller();
  if (!caller.userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!caller.isStaff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!resumeBucketName()) {
    return NextResponse.json(
      { error: "Resume storage is not configured." },
      { status: 503 },
    );
  }

  // The most expensive endpoint here: thousands of reads, gigabytes of egress.
  const limit = await rateLimitShared(
    `resume-book-${caller.userId}`,
    BURST_LIMITS.tenPerHour.maxTokens,
    BURST_LIMITS.tenPerHour.refillRate,
    1,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many downloads. Try again in ${limit.retryAfter} seconds.`,
      },
      { status: 429 },
    );
  }

  const params = request.nextUrl.searchParams;
  const gradYear = Number(params.get("gradYear"));

  const rows = await listResumes(db as DrizzleDB, {
    scope: params.get("scope") === "all" ? "all" : "members",
    search: params.get("search")?.slice(0, 200) || undefined,
    gradYear: Number.isFinite(gradYear) && gradYear > 0 ? gradYear : undefined,
    userIds: parseResumeBookIds(params.get("ids")),
  });

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Nothing matches that selection." },
      { status: 400 },
    );
  }

  // archiver 8 dropped the default factory export; the class is the API now.
  // PDFs are already compressed, so deflating them burns CPU for ~1%.
  const archive = new ZipArchive({ zlib: { level: 0 }, store: true });

  // An 'error' event with no listener takes down the container. Every await
  // below races this, so a dead archive fails the writer instead of parking it.
  const failure = new Promise<never>((_, reject) => {
    archive.on("error", reject);
  });
  failure.catch(() => {});

  const taken = new Set<string>();
  const named = rows.map((row) => ({
    ...row,
    zipName: uniqueZipName(taken, row.displayName),
  }));

  const csvWritten = waitForNamedEntry(archive, "index.csv");

  archive.append(
    [
      "name,email,school,major,graduation_year,membership,file",
      ...named.map((row) =>
        [
          row.displayName,
          row.email,
          row.school,
          row.major,
          row.graduationYear,
          row.isCurrentMember ? "member" : "non-member",
          row.zipName,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n"),
    { name: "index.csv" },
  );

  // Filled while the response streams. Awaiting it here would buffer the whole
  // book before the first byte reached the client.
  void (async () => {
    const skipped: string[] = [];
    const pending = new Map<number, Promise<Buffer | null>>();

    const prefetch = (i: number) => {
      const row = named[i];
      if (!row) return;
      pending.set(
        i,
        readResume(row.storageKey).catch(() => null),
      );
    };

    for (let i = 0; i < PREFETCH; i += 1) prefetch(i);

    try {
      await Promise.race([csvWritten, failure]);

      for (const [i, row] of named.entries()) {
        // Reader hung up. Reading the rest of the book for nobody is the cost.
        if (request.signal.aborted) {
          archive.destroy();
          return;
        }

        const buffer = await pending.get(i);
        pending.delete(i);
        prefetch(i + PREFETCH);

        if (!buffer) {
          // One unreadable object drops itself, not the book.
          skipped.push(row.displayName);
          continue;
        }

        const written = waitForNamedEntry(archive, row.zipName);
        archive.append(buffer, { name: row.zipName });
        await Promise.race([written, failure]);
      }

      if (skipped.length > 0) {
        archive.append(
          `These resumes could not be read from storage:\r\n${skipped.join("\r\n")}\r\n`,
          { name: "skipped.txt" },
        );
      }
    } catch (error) {
      archive.abort();
      throw error;
    }

    await Promise.race([archive.finalize(), failure]);
  })().catch((error) => {
    // The client sees a truncated ZIP; once the response starts, the log is
    // the only place this is legible.
    console.error("resume book failed", error);
    archive.destroy();
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(
    Readable.toWeb(archive) as ReadableStream<Uint8Array>,
    {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="resume-book-${stamp}.zip"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
