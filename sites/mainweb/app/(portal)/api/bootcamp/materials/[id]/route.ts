import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { db, bootcampMaterials } from "@query/db";
import { eq } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import {
  enrolledInTerm,
  loadMaterial,
  portalCaller,
} from "@/lib/bootcamp-access";
import { materialContentDisposition } from "@/lib/bootcamp-materials";
import {
  bootcampBucketName,
  deleteMaterial,
  materialReadStream,
} from "@/lib/bootcamp-storage";

/**
 * One handout: yours if you bought the bootcamp it belongs to, or anyone's if
 * you are staff. Proxied rather than redirected to a signed URL, so the bucket
 * keeps public access prevention on and a copied link is worth nothing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const caller = await portalCaller();

  if (!caller.userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!bootcampBucketName()) {
    return NextResponse.json(
      { error: "Bootcamp storage is not configured." },
      { status: 503 },
    );
  }

  const material = await loadMaterial(id);
  if (!material) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed =
    caller.isStaff || (await enrolledInTerm(caller.userId, material.term));
  // 404, not 403: whether a file exists is worth nothing to someone who may
  // not read it.
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A read that fails after the headers are out reaches the browser as a
  // truncated download, so log it here.
  const stream = materialReadStream(material.storageKey);
  stream.on("error", (error) => {
    console.error("bootcamp material read failed", material.storageKey, error);
  });

  return new NextResponse(
    Readable.toWeb(stream) as ReadableStream<Uint8Array>,
    {
      status: 200,
      headers: {
        "content-type": material.contentType,
        "content-length": String(material.sizeBytes),
        "content-disposition": materialContentDisposition(material.fileName),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

/** Staff only — members download, they do not curate. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const caller = await portalCaller();

  if (!caller.userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!caller.isStaff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [removed] = await (db as DrizzleDB)
    .delete(bootcampMaterials)
    .where(eq(bootcampMaterials.id, id))
    .returning({ storageKey: bootcampMaterials.storageKey });

  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Row first: an orphaned object costs pennies, an orphaned row keeps serving
  // a file staff asked to take down.
  try {
    await deleteMaterial(removed.storageKey);
  } catch (error) {
    console.error("bootcamp material object delete failed", error);
  }

  return NextResponse.json({ removed: true });
}
