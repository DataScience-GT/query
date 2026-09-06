import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { db } from "@query/db";
import { loadResume, resumeCaller, resumeFileName } from "@/lib/resume-access";
import { resumeReadStream } from "@/lib/resume-storage";

/** One stored PDF: yours, or anyone's if you are staff. Proxied, not redirected — a signed URL to storage.googleapis.com would leave the origin and CSP frame-src with it. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: requested } = await params;
  const caller = await resumeCaller();

  if (!caller.userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // `me` keeps the viewer's own id out of the settings markup.
  const userId = requested === "me" ? caller.userId : requested;

  if (caller.userId !== userId && !caller.isStaff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resume = await loadResume(userId);
  if (!resume) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = Readable.toWeb(
    resumeReadStream(resume.storageKey),
  ) as ReadableStream<Uint8Array>;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${resumeFileName(resume.displayName)}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
