"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { QRScannerModal } from "@/components/portal/QRScannerModal";
import { decodeHackathonParam } from "@/lib/hackathon-slug";

type Project = {
  id: string;
  name: string;
  description?: string | null;
  tableNumber?: number | null;
  githubUrl?: string | null;
  demoUrl?: string | null;
  videoUrl?: string | null;
  tracks?: string[] | null;
};

const CRITERIA = [
  { key: "scoreCreativity", label: "Creativity" },
  { key: "scoreImpact", label: "Impact" },
  { key: "scoreScope", label: "Scope" },
  { key: "scoreClarity", label: "Clarity" },
  { key: "scoreSoundness", label: "Soundness" },
] as const;

type ScoreKey = (typeof CRITERIA)[number]["key"];
type Scores = Record<ScoreKey, number>;

const BLANK: Scores = {
  scoreCreativity: 5,
  scoreImpact: 5,
  scoreScope: 5,
  scoreClarity: 5,
  scoreSoundness: 5,
};

export default function JudgeHackathonPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();

  /**
   * The [id] segment is a name on every sibling route, but the judging
   * procedures take a uuid, so a by-name URL would fail input validation.
   * Resolve it first when it is not already an id.
   */
  const rawId = params.id;
  const routeParam = decodeHackathonParam(
    Array.isArray(rawId) ? (rawId[0] ?? "") : ((rawId as string | undefined) ?? ""),
  );
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      routeParam,
    );
  const resolved = trpc.hackathon.getById.useQuery(
    { id: routeParam },
    { enabled: !!session && !isUuid },
  );
  const hackathonId = isUuid ? routeParam : resolved.data?.id;

  const [current, setCurrent] = useState<{
    project: Project | null;
    queueId: string | null;
  } | null>(null);
  const [scores, setScores] = useState<Scores>(BLANK);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  /** Server-stamped arrival. Until the judge scans the table, the scoring form
   *  stays closed so the clock cannot start from across the room. */
  const [arrived, setArrived] = useState(false);
  /** Set when a skip had nowhere to rotate to — this is the judge's last
   *  uncompleted table, so "skip" cannot move them off it. */
  const [stranded, setStranded] = useState(false);
  const [done, setDone] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  const judgeCheck = trpc.judge.isJudge.useQuery(
    { hackathonId: hackathonId as string },
    { enabled: !!session && !!hackathonId },
  );

  /**
   * Fetched once, not polled. Every call re-claims a table, so a background
   * refetch could hand the judge a different project mid-score; the mutations
   * below already return the next one.
   */
  /**
   * Whether judging is open.
   *
   * getNextTable has no such guard, so without this the page hands a judge a
   * table and a full scoring form while judgingActive is false — and then
   * submitVote and completeAndNext both throw FORBIDDEN. The judge interviews
   * the team, types their notes, presses submit and loses all of it. The flag
   * defaults to false, so this is the state every event starts in.
   */
  const judgingStatus = trpc.judge.getJudgingStatus.useQuery(
    { hackathonId: hackathonId as string },
    { enabled: !!session && !!hackathonId },
  );

  const judgingOpen = judgingStatus.data?.active === true;

  const nextTable = trpc.judge.getNextTable.useQuery(
    { hackathonId: hackathonId as string },
    {
      enabled:
        !!session &&
        !!hackathonId &&
        judgeCheck.data?.isJudge === true &&
        judgingOpen,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  const progress = trpc.judge.getProgress.useQuery(
    { hackathonId: hackathonId as string },
    { enabled: !!session && !!hackathonId && judgeCheck.data?.isJudge === true },
  );

  // Seeds the first project only. Once a mutation has taken over, `current` or
  // `done` is set and a late-arriving response must not replace what the judge
  // is looking at.
  useEffect(() => {
    if (!nextTable.data || current || done) return;
    if (nextTable.data.done) {
      setDone(true);
      return;
    }
    setCurrent({
      project: (nextTable.data.project as Project) ?? null,
      queueId: nextTable.data.queueId ?? null,
    });
  }, [nextTable.data, current, done]);

  const advance = (
    project: Project | null,
    queueId: string | null,
    // startByQrCode is the one caller that has already arrived; every other
    // path hands over a table the judge still has to walk to.
    hasArrived = false,
  ) => {
    setScores(BLANK);
    setComment("");
    setError("");
    setStartedAt(Date.now());
    setArrived(hasArrived);
    progress.refetch();
    if (!project) {
      setDone(true);
      setCurrent(null);
      return;
    }
    setCurrent({ project, queueId });
  };

  // Neither mutation invalidates getNextTable: refetching it would claim a
  // table a second time, and both already return the next project to show.
  const complete = trpc.judge.completeAndNext.useMutation({
    onSuccess: (res) => {
      if (res.done) {
        advance(null, null);
        return;
      }
      advance((res.nextProject as Project) ?? null, res.nextQueueId ?? null);
    },
    onError: (e) => setError(e.message),
  });

  /**
   * Scanning the table card is what starts the clock.
   *
   * The judge is handed a table by the queue, walks to it, and scans — only
   * then does scoring time begin, and only then does the form open. It also
   * catches a judge standing at the wrong table before they score it.
   */
  const startByQr = trpc.judge.startByQrCode.useMutation({
    onSuccess: (res) => {
      setShowScanner(false);
      setError("");
      advance((res.project as Project) ?? null, res.queueId ?? null, true);
    },
    onError: (e) => {
      setShowScanner(false);
      setError(e.message);
    },
  });

  const skip = trpc.judge.skipProject.useMutation({
    onSuccess: (res) => {
      // Skipping the last uncompleted item hands back the same project: there
      // is nothing to rotate to. Saying so is the difference between a button
      // that looks broken and one that explains the only way out.
      setStranded(res.skippedToEnd === true);
      advance((res.project as Project) ?? null, res.queueId ?? null);
    },
    onError: (e) => setError(e.message),
  });

  // The escape from a table nobody is standing at: marks it done without a
  // score and hands the project to another judge, so it still gets seen.
  const forceSkip = trpc.judge.forceSkipOvertime.useMutation({
    onSuccess: (res) => {
      setStranded(false);
      if (!res.reassigned) {
        setError(
          "Marked done, but no other judge was free to take it — flag this table to an organiser.",
        );
      }
      advance((res.project as Project) ?? null, res.queueId ?? null);
    },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading") {
    return <LoadingScreen message="Verifying Judge Access…" />;
  }
  if (!session) return null;

  // Without this the disabled judgeCheck below stays pending forever and the
  // page spins on a hackathon that does not exist.
  if (!hackathonId) {
    if (resolved.isPending) {
      return <LoadingScreen message="Loading hackathon…" />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <LiquidGlass className="p-12 max-w-md text-center">
          <h1 className="text-2xl font-black text-[var(--text-primary)] mb-4 uppercase tracking-tight">
            Hackathon Not Found
          </h1>
          <p className="text-sm text-text-muted font-mono mb-8">
            {resolved.error?.message ?? "That hackathon does not exist."}
          </p>
          <Link
            href="/judge"
            className="px-6 py-3 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
          >
            Back to Judge Portal
          </Link>
        </LiquidGlass>
      </div>
    );
  }

  if (judgeCheck.isPending) {
    return <LoadingScreen message="Verifying Judge Access…" />;
  }

  if (judgeCheck.data && !judgeCheck.data.isJudge) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <LiquidGlass className="p-12 max-w-md text-center">
          <h1 className="text-2xl font-black text-[var(--text-primary)] mb-4 uppercase tracking-tight">
            Not a Judge
          </h1>
          <p className="text-sm text-text-muted font-mono mb-8">
            Your judge account for this hackathon has not been approved yet.
          </p>
          <Link
            href="/judge"
            className="px-6 py-3 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
          >
            Back to Judge Portal
          </Link>
        </LiquidGlass>
      </div>
    );
  }

  if (judgingStatus.isPending) {
    return <LoadingScreen message="Checking judging status…" />;
  }

  // Said before a table is handed out, not after a score is lost.
  if (!judgingOpen) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <LiquidGlass className="p-12 max-w-md text-center">
          <h1 className="text-2xl font-black text-[var(--text-primary)] mb-4 uppercase tracking-tight">
            Judging Not Open
          </h1>
          <p className="text-sm text-text-muted font-mono mb-8 leading-relaxed">
            Scoring has not been opened for this hackathon yet. Your queue is
            waiting — an organiser will start judging when the expo begins.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => judgingStatus.refetch()}
              className="px-6 py-3 border border-accent/40 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/10 transition-colors"
            >
              Check again
            </button>
            <Link
              href="/judge"
              className="px-6 py-3 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
            >
              Back to Judge Portal
            </Link>
          </div>
        </LiquidGlass>
      </div>
    );
  }

  if (nextTable.isPending && !current) {
    return <LoadingScreen message="Finding your next table…" />;
  }

  // A failed lookup must not fall through to the "All Done" card below — a
  // judge told they have finished walks away with their queue unscored.
  if (nextTable.error && !current) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <LiquidGlass className="p-12 max-w-md text-center">
          <h1 className="text-2xl font-black text-[var(--text-primary)] mb-4 uppercase tracking-tight">
            Could Not Load Your Queue
          </h1>
          <p className="text-sm text-text-muted font-mono mb-8">
            {nextTable.error.message}
          </p>
          <button
            type="button"
            onClick={() => nextTable.refetch()}
            className="px-6 py-3 bg-accent text-black text-xs font-black uppercase tracking-widest hover:bg-white transition-colors"
          >
            Try Again
          </button>
        </LiquidGlass>
      </div>
    );
  }

  const total = scores.scoreCreativity +
    scores.scoreImpact +
    scores.scoreScope +
    scores.scoreClarity +
    scores.scoreSoundness;

  const project = current?.project;
  const busy =
    complete.isPending || skip.isPending || forceSkip.isPending;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-text-muted font-sans pb-24">
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/judge"
            className="text-text-muted hover:text-accent transition-colors font-mono text-xs tracking-widest uppercase"
          >
            ← Judge Portal
          </Link>
          {progress.data && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
              {progress.data.completed} / {progress.data.total} judged
            </p>
          )}
        </div>

        {progress.data && progress.data.total > 0 && (
          <div className="h-1 w-full bg-white/5 mb-12">
            <div
              className="h-full bg-accent transition-ui duration-500"
              style={{ width: `${progress.data.percentage}%` }}
            />
          </div>
        )}

        {error && (
          <div className="p-4 mb-8 bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 font-mono text-sm">{error}</p>
          </div>
        )}

        {done || !project ? (
          <LiquidGlass className="p-12 text-center">
            <h1 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-4">
              All Done
            </h1>
            <p className="text-sm text-text-muted font-mono">
              You have judged every project assigned to you. Thank you.
            </p>
          </LiquidGlass>
        ) : (
          <>
            <div className="mb-10">
              {project.tableNumber != null && (
                <p className="text-accent font-mono text-xs uppercase tracking-[0.4em] mb-3">
                  Table {project.tableNumber}
                </p>
              )}
              <h1 className="text-4xl md:text-5xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none mb-4">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-sm text-text-muted leading-relaxed max-w-2xl">
                  {project.description}
                </p>
              )}
              <div className="flex flex-wrap gap-3 mt-6">
                {[
                  { href: project.githubUrl, label: "Repository" },
                  { href: project.demoUrl, label: "Live Demo" },
                  { href: project.videoUrl, label: "Video" },
                ]
                  .filter((l) => !!l.href)
                  .map((l) => (
                    <a
                      key={l.label}
                      href={l.href as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-[10px] uppercase tracking-widest hover:bg-white/5 transition-colors"
                    >
                      {l.label}
                    </a>
                  ))}
              </div>
            </div>

            {/* The scoring form stays shut until the table card is scanned.
                Opening it earlier is what let the clock run across the walk,
                and let a judge score a table they never actually reached. */}
            {!arrived ? (
              <LiquidGlass className="p-10 text-center border-accent/20">
                <h2 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-3">
                  Scan the team&apos;s code to begin
                </h2>
                <p className="text-sm text-text-muted font-mono mb-8 leading-relaxed max-w-md mx-auto">
                  Walk to table {project.tableNumber ?? "?"} and scan the card
                  on their desk. Your judging time starts from the scan, not
                  from when this table was assigned to you.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setShowScanner(true);
                  }}
                  disabled={startByQr.isPending}
                  className="px-10 py-5 bg-accent text-black font-black text-sm uppercase tracking-widest rounded-none hover:bg-white transition-ui active:scale-95 disabled:opacity-40"
                >
                  {startByQr.isPending ? "Starting…" : "Scan Table Code"}
                </button>
              </LiquidGlass>
            ) : (
            <LiquidGlass className="p-8 space-y-8">
              {CRITERIA.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-3">
                    <label
                      htmlFor={c.key}
                      className="text-xs font-mono uppercase tracking-widest text-text-muted font-bold"
                    >
                      {c.label}
                    </label>
                    <span className="font-mono text-accent font-black text-lg">
                      {scores[c.key]}
                    </span>
                  </div>
                  <input
                    id={c.key}
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={scores[c.key]}
                    onChange={(e) =>
                      setScores((prev) => ({
                        ...prev,
                        [c.key]: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
              ))}

              <div>
                <label
                  htmlFor="comment"
                  className="block text-xs font-mono uppercase tracking-widest text-text-muted font-bold mb-3"
                >
                  Notes (optional)
                </label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="What stood out?"
                  className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-sm placeholder:text-gray-600 focus:border-accent/50 focus:outline-none resize-none"
                />
              </div>

              {stranded && (
                <div
                  role="status"
                  className="p-4 border border-amber-500/30 bg-amber-500/10"
                >
                  <p className="font-mono text-xs text-amber-300 leading-relaxed">
                    This is the last table left in your queue, so there is
                    nothing to skip to. If nobody is here, hand it to another
                    judge instead — it will still get scored.
                  </p>
                  <button
                    type="button"
                    disabled={busy || !current?.queueId}
                    onClick={() => {
                      setError("");
                      if (current?.queueId)
                        forceSkip.mutate({ queueId: current.queueId });
                    }}
                    className="mt-3 px-4 py-2 border border-amber-500/40 bg-amber-500/10 text-amber-200 font-mono text-xs uppercase tracking-widest hover:bg-amber-500/20 transition-colors disabled:opacity-30"
                  >
                    {forceSkip.isPending
                      ? "Reassigning…"
                      : "Hand to another judge"}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[var(--border-subtle)]">
                <p className="font-mono text-xs text-text-muted">
                  Total <span className="text-accent font-black">{total}</span>{" "}
                  / 50
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={busy || !current?.queueId}
                    onClick={() => {
                      setError("");
                      if (current?.queueId)
                        skip.mutate({ queueId: current.queueId });
                    }}
                    className="px-6 py-3 border border-[var(--border-subtle)] text-text-muted font-mono text-xs uppercase tracking-widest hover:bg-white/5 transition-colors disabled:opacity-30"
                  >
                    {skip.isPending ? "Skipping…" : "Skip for now"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !current?.queueId}
                    onClick={() => {
                      setError("");
                      if (!current?.queueId || !project) return;
                      complete.mutate({
                        queueId: current.queueId,
                        projectId: project.id,
                        ...scores,
                        durationSeconds: Math.max(
                          0,
                          Math.round((Date.now() - startedAt) / 1000),
                        ),
                        comment: comment || undefined,
                      });
                    }}
                    className="px-8 py-3 bg-accent text-black font-black text-xs uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-30"
                  >
                    {complete.isPending ? "Saving…" : "Submit & Next"}
                  </button>
                </div>
              </div>
            </LiquidGlass>
            )}
          </>
        )}
      </main>

      {showScanner && (
        <QRScannerModal
          onClose={() => setShowScanner(false)}
          onScan={(codes: { rawValue: string }[]) => {
            const raw = codes[0]?.rawValue;
            if (!raw || startByQr.isPending) return;
            // The card encodes the code on its own. Accepting a bare value
            // keeps the printed card as small and as scannable as possible.
            startByQr.mutate({ qrCode: raw.trim() });
          }}
          onError={(e: unknown) => console.error(e)}
          isProcessing={startByQr.isPending}
          isPaused={startByQr.isPending}
        />
      )}
    </div>
  );
}
