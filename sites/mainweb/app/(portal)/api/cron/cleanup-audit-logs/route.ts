import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db, auditLogs } from "@query/db";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db!.delete(auditLogs);
  return NextResponse.json({ ok: true });
}
