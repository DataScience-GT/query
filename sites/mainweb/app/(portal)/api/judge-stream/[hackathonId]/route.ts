/**
 * Real-time judging stream via Server-Sent Events (SSE).
 *
 * GET /api/judge-stream/:hackathonId
 *
 * Streams live judging coverage snapshots every 8 seconds so the admin
 * leaderboard and judge progress bars stay current without polling tRPC.
 * Requires an active session (reads userId from NextAuth).
 */
import { auth } from "@query/auth";
import { db } from "@query/db";
import {
  judgeQueue,
  judgeVotes,
  judgingProjects,
  admins,
  judges,
} from "@query/db";
import { eq, and, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICK_MS = 8_000; // push an update every 8 seconds

export async function GET(
  req: Request,
  { params }: { params: Promise<{ hackathonId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { hackathonId } = await params;

  if (!db) {
    return new Response("Database unavailable", { status: 503 });
  }

  // Caller must be an admin or a judge assigned to this hackathon
  const [adminRecord, judgeRecord] = await Promise.all([
    db.query.admins.findFirst({
      where: and(eq(admins.userId, session.user.id), eq(admins.isActive, true)),
    }),
    db.query.judges.findFirst({
      where: and(eq(judges.userId, session.user.id), eq(judges.isActive, true)),
    }),
  ]);

  if (!adminRecord && !judgeRecord) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();

  /** Snapshot query: votes cast + queue progress for this hackathon. */
  async function buildSnapshot() {
    if (!db) return null;

    const [voteStats, queueStats, projectCount] = await Promise.all([
      // Total votes cast per project
      db
        .select({
          projectId: judgeVotes.projectId,
          voteCount: sql<number>`count(*)`,
          avgScore: sql<number>`round(avg(${judgeVotes.score})::numeric, 2)`,
        })
        .from(judgeVotes)
        .innerJoin(
          judgingProjects,
          eq(judgingProjects.id, judgeVotes.projectId),
        )
        .where(eq(judgingProjects.hackathonId, hackathonId))
        .groupBy(judgeVotes.projectId),

      // Queue completion across all judges
      db
        .select({
          total: sql<number>`count(*)`,
          completed: sql<number>`sum(case when ${judgeQueue.isCompleted} then 1 else 0 end)`,
          judgesActive: sql<number>`count(distinct ${judgeQueue.judgeId})`,
        })
        .from(judgeQueue)
        .where(eq(judgeQueue.hackathonId, hackathonId)),

      // Total projects in this hackathon
      db
        .select({ count: sql<number>`count(*)` })
        .from(judgingProjects)
        .where(eq(judgingProjects.hackathonId, hackathonId)),
    ]);

    const qs = queueStats[0];
    const total = Number(qs?.total ?? 0);
    const completed = Number(qs?.completed ?? 0);

    return {
      hackathonId,
      timestamp: Date.now(),
      totalProjects: Number(projectCount[0]?.count ?? 0),
      totalQueueItems: total,
      completedQueueItems: completed,
      completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      judgesActive: Number(qs?.judgesActive ?? 0),
      topProjects: voteStats
        .sort((a, b) => Number(b.avgScore) - Number(a.avgScore))
        .slice(0, 10)
        .map((v) => ({
          projectId: v.projectId,
          votes: Number(v.voteCount),
          avg: Number(v.avgScore),
        })),
    };
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // Send initial snapshot immediately
      const first = await buildSnapshot();
      if (first) send(first);

      // Tick every TICK_MS.
      // setInterval expects a void-returning callback, so the async work is
      // wrapped in a void-prefixed IIFE to satisfy @typescript-eslint/no-misused-promises.
      const interval = setInterval(() => {
        void (async () => {
          if (closed) {
            clearInterval(interval);
            return;
          }
          try {
            const snapshot = await buildSnapshot();
            if (snapshot) send(snapshot);
          } catch {
            // Non-fatal — skip this tick
          }
        })();
      }, TICK_MS);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering for SSE
    },
  });
}
