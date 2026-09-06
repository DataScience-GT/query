import { NextResponse } from "next/server";
import { db } from "@query/db";
import { loadResume, resumeCaller, resumeFileName } from "@/lib/resume-access";
import { readResume } from "@/lib/resume-storage";

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

  // Read it whole rather than piping: uploads are capped at 2MB, and a stream
  // that fails after the headers are out is a truncated PDF the viewer sees as
  // a corrupt file instead of an error.
  let pdf: Buffer;
  try {
    pdf = await readResume(resume.storageKey);
  } catch (error) {
    // A row whose object is gone is genuinely missing to the reader; anything
    // else is storage being down, which is ours to own.
    if ((error as { code?: number }).code === 404) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("resume read failed", error);
    return NextResponse.json(
      { error: "Resume storage is unavailable right now." },
      { status: 502 },
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdf.length),
      "content-disposition": `inline; filename="${resumeFileName(resume.displayName)}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
