import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { bootcampWorkshops, db } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { eq } from "drizzle-orm";
import { BURST_LIMITS, rateLimitShared } from "@query/api";
import { bootcampCaller } from "@/lib/bootcamp-access";
import {
  bootcampBucketName,
  bootcampStorageKey,
  deleteBootcampZip,
} from "@/lib/bootcamp-storage";

/** Workshop deletion owns both its database row and deterministic objects. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workshopId: string }> },
) {
  const { workshopId } = await params;
  const caller = await bootcampCaller();
  if (!caller.userId || !db) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!caller.isStaff) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  // A non-uuid id makes Postgres throw; answer 400 instead of a 500.
  if (!isUuid(workshopId)) {
    return NextResponse.json({ error: "Invalid workshop id" }, { status: 400 });
  }
  if (!bootcampBucketName()) {
    return NextResponse.json(
      { error: "Bootcamp storage is not configured. Tell an officer." },
      { status: 503 },
    );
  }

  const limit = await rateLimitShared(
    `bootcamp-delete-${caller.userId}`,
    BURST_LIMITS.tenPerHour.maxTokens,
    BURST_LIMITS.tenPerHour.refillRate,
    1,
  );
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many deletes." }, { status: 429 });
  }

  const [removed] = await (db as DrizzleDB)
    .delete(bootcampWorkshops)
    .where(eq(bootcampWorkshops.id, workshopId))
    .returning({ id: bootcampWorkshops.id });
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Row first: a cleanup outage may leave cheap private objects, but never a
  // live record serving files an officer asked to erase.
  try {
    await Promise.all([
      deleteBootcampZip(bootcampStorageKey(workshopId, "materials")),
      deleteBootcampZip(bootcampStorageKey(workshopId, "solution")),
    ]);
  } catch (error) {
    console.error("bootcamp workshop object cleanup failed", error);
    return NextResponse.json(
      { error: "The workshop was deleted, but storage cleanup failed." },
      { status: 502 },
    );
  }

  return NextResponse.json({ removed: true });
}
