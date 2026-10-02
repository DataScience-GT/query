"use client";

import React, { useEffect, useRef, useState } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { QRScannerModal } from "@/components/portal/QRScannerModal";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import { ChevronLeft } from "lucide-react";

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

// Mirrors packages/api/src/routers/judge/dispatch.ts: amber at the target,
// form locked at the hard cutoff. The server enforces the cutoff; this only
// shows it.
const TARGET_SECONDS = 180;
const HARD_LIMIT_SECONDS = 240;

const TIME_UP_MESSAGE =
  "Time ran out on that table before a score went in, so it goes back to be judged by someone else. Here is your next table.";

/**
 * A server timestamp on this phone's clock. The judging clock has to agree
 * with the server's cutoff, and a phone set a minute off would otherwise
 * show 3:00 when the server already counts 4:00.
 */
function toLocalClock(
  serverTime: Date | string | null,
  serverNow: Date | string,
): number | null {
  if (!serverTime) return null;
  const offset = Date.now() - new Date(serverNow).getTime();
  return new Date(serverTime).getTime() + offset;
}

const mmss = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

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
  /** When the judging clock started, on this device's clock: the server's
   *  arrival stamp shifted by the server/phone offset. Null until the judge
   *  taps or scans the table, and the scoring form stays shut until then. */
  const [clockStart, setClockStart] = useState<number | null>(null);
  const arrived = clockStart !== null;
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (clockStart === null) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [clockStart]);
  const elapsed =
    clockStart === null ? 0 : Math.max(0, Math.floor((tick - clockStart) / 1000));
  const timeUp = clockStart !== null && elapsed >= HARD_LIMIT_SECONDS;
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
  if (nextTable.data && !current && !done) {
    if (nextTable.data.done) {
      setDone(true);
    } else {
      setCurrent({
        project: (nextTable.data.project as Project) ?? null,
        queueId: nextTable.data.queueId ?? null,
      });
      // A reload mid-table keeps the clock it already had.
      setClockStart(
        toLocalClock(nextTable.data.arrivedAt ?? null, nextTable.data.serverNow),
      );
    }
  }

  const advance = (
    project: Project | null,
    queueId: string | null,
    // Set when the table has already been started (the tap or scan); every
    // other hand-over is a table the judge still has to walk to.
    clock: number | null = null,
  ) => {
    setScores(BLANK);
    setComment("");
    setError("");
    setStartedAt(Date.now());
    setClockStart(clock);
    progress.refetch();
    if (!project) {
      setDone(true);
      setCurrent(null);
      return;
    }
    setCurrent({ project, queueId });
  };

  /**
   * The slot on screen is gone: an organiser withdrew the project, which
   * deletes its unscored slots. Every action on the card would fail the same
   * way, so fetch the next table instead of leaving the judge on a dead card.
   * Only these answers mean that; anything else (judging closed) keeps the
   * card and the scores typed into it.
   */
  const recoverOrReport = (e: {
    message: string;
    data?: { code?: string } | null;
  }) => {
    const slotGone =
      e.data?.code === "NOT_FOUND" ||
      (e.data?.code === "FORBIDDEN" &&
        e.message.includes("not in your judging queue"));
    if (!slotGone) {
      setError(e.message);
      return;
    }
    const goneQueueId = current?.queueId;
    void nextTable.refetch().then(({ data, isError }) => {
      // A failed refetch still resolves, carrying the cached answer — the
      // withdrawn table itself. Moving to it would put the judge back on the
      // dead card under a message saying they had a new one.
      if (isError || !data || (!data.done && data.queueId === goneQueueId)) {
        setError(
          "That table was withdrawn by an organiser, and your next one could not be loaded. Check your connection and try again.",
        );
        return;
      }
      advance(
        data.done ? null : ((data.project as Project) ?? null),
        data.queueId ?? null,
        data.done ? null : toLocalClock(data.arrivedAt ?? null, data.serverNow),
      );
      setError("That table was withdrawn by an organiser. Here is your next one.");
    });
  };

  // Neither mutation invalidates getNextTable: refetching it would claim a
  // table a second time, and both already return the next project to show.
  const complete = trpc.judge.completeAndNext.useMutation({
    onSuccess: (res) => {
      if (res.done) advance(null, null);
      else
        advance(
          (res.nextProject as Project) ?? null,
          res.nextQueueId ?? null,
          toLocalClock(res.nextArrivedAt ?? null, res.serverNow),
        );
      if (res.timedOut) setError(TIME_UP_MESSAGE);
    },
    onError: recoverOrReport,
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
      advance(
        (res.project as Project) ?? null,
        res.queueId ?? null,
        toLocalClock(res.arrivedAt, res.serverNow),
      );
    },
    onError: (e) => {
      setShowScanner(false);
      setError(e.message);
    },
  });

  // Passing on a table returns it to the pool for another judge; this judge
  // is not sent back to it. Also what "time's up" uses to move on.
  const skip = trpc.judge.skipProject.useMutation({
    onSuccess: (res) =>
      advance(
        res.done ? null : ((res.project as Project) ?? null),
        res.queueId ?? null,
        res.done ? null : toLocalClock(res.arrivedAt ?? null, res.serverNow),
      ),
    onError: recoverOrReport,
  });

  /**
   * Tap-to-start. The NFC tag on a table holds this page's URL with
   * ?table=<code>, so tapping it opens the page and starts that table exactly
   * as scanning the printed card would. Waits for judge access and an open
   * round; the param is dropped once used so a reload cannot replay it
   * (startByQrCode is idempotent anyway).
   */
  const tappedTable = useRef(false);
  useEffect(() => {
    if (tappedTable.current) return;
    if (!hackathonId || judgeCheck.data?.isJudge !== true || !judgingOpen) return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get("table");
    if (!code) return;
    tappedTable.current = true;
    url.searchParams.delete("table");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    startByQr.mutate({ qrCode: code.trim() });
  }, [hackathonId, judgeCheck.data?.isJudge, judgingOpen, startByQr]);

  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);

  if (status === "loading") {
    return <LoadingScreen message="Checking access…" />;
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
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-4">
            Hackathon Not Found
          </h1>
          <p className="text-sm text-[var(--text-muted)] mb-8">
            {resolved.error?.message ?? "That hackathon does not exist."}
          </p>
          <Link
            href="/judge"
            className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
          >
            Back to Judge Portal
          </Link>
        </LiquidGlass>
      </div>
    );
  }

  if (judgeCheck.isPending) {
    return <LoadingScreen message="Checking access…" />;
  }

  if (judgeCheck.data && !judgeCheck.data.isJudge) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <LiquidGlass className="p-12 max-w-md text-center">
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-4">
            Not a Judge
          </h1>
          <p className="text-sm text-[var(--text-muted)] mb-8">
            Your judge account for this hackathon has not been approved yet.
          </p>
          <Link
            href="/judge"
            className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
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
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-4">
            Judging Not Open
          </h1>
          <p className="text-sm text-[var(--text-muted)] mb-8 leading-relaxed">
            Scoring has not been opened for this hackathon yet. Your queue is
            waiting — an organiser will start judging when the expo begins.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => judgingStatus.refetch()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
            >
              Check again
            </button>
            <Link
              href="/judge"
              className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
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
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-4">
            Could Not Load Your Queue
          </h1>
          <p className="text-sm text-[var(--text-muted)] mb-8">
            {nextTable.error.message}
          </p>
          <button
            type="button"
            onClick={() => nextTable.refetch()}
            className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
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
    complete.isPending || skip.isPending;

  return (
    <div className="relative min-h-screen bg-[var(--bg-tertiary)] pb-24">
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/judge"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-accent"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Judging
          </Link>
          {progress.data && (
            <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em]">
              {progress.data.completed} judged
            </p>
          )}
        </div>

        {/* No progress bar: judges draw from a shared pool, so a share of
            every eligible project says nothing about how a judge is doing. */}
        <div className="mb-12" />

        {error && (
          <div className="p-4 mb-8 rounded-sm bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {done || !project ? (
          // An empty queue is not a finished one: "All done, 0 of 0" told a
          // judge with nothing assigned that they had judged everything. Nor is
          // an unknown one: "All done" waits until progress says there was work.
          <LiquidGlass className="p-12 text-center">
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-4">
              {progress.data?.total === 0
                ? "No tables yet"
                : (progress.data?.total ?? 0) > 0
                  ? "All done"
                  : "Your queue"}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {progress.data?.total === 0
                ? "There are no projects for you to judge yet. Tell an organiser."
                : (progress.data?.total ?? 0) > 0
                  ? "You have been to every project you can judge. Thank you."
                  : progress.isError
                    ? "Couldn't load your progress. Refresh the page."
                    : "Loading your queue…"}
            </p>
          </LiquidGlass>
        ) : (
          <>
            <div className="mb-10">
              {project.tableNumber != null && (
                <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-2">
                  Table {project.tableNumber}
                </p>
              )}
              <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-4">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-2xl">
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
                      className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
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
                <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-3">
                  Scan the team&apos;s code to begin
                </h2>
                <p className="text-sm text-[var(--text-muted)] mb-8 leading-relaxed max-w-md mx-auto">
                  Walk to table {project.tableNumber ?? "?"} and tap your phone
                  on the NFC tag, or scan the card on their desk. Your judging
                  time starts from then, not from when this table was assigned
                  to you.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setShowScanner(true);
                  }}
                  disabled={startByQr.isPending}
                  className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
                >
                  {startByQr.isPending ? "Starting…" : "Scan Table Code"}
                </button>
                <button
                  type="button"
                  disabled={busy || !current?.queueId}
                  onClick={() => {
                    setError("");
                    if (current?.queueId) skip.mutate({ queueId: current.queueId });
                  }}
                  className="block mx-auto mt-5 text-xs text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text-primary)] disabled:opacity-50"
                >
                  Can't find the team? Get another table
                </button>
              </LiquidGlass>
            ) : (
            <LiquidGlass className="p-8 space-y-8">
              {/* The clock runs from the tap or scan. Amber at 3:00; at 4:00
                  the form locks and the table goes back into the pool. */}
              <div
                role="timer"
                aria-live="off"
                className={`flex items-center justify-between gap-4 rounded-sm border px-4 py-3 ${
                  timeUp
                    ? "border-red-500/40 bg-red-500/10"
                    : elapsed >= TARGET_SECONDS
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  {timeUp
                    ? "Time's up"
                    : elapsed >= TARGET_SECONDS
                      ? `Wrap up: score locks at ${mmss(HARD_LIMIT_SECONDS)}`
                      : `Aim for ${mmss(TARGET_SECONDS)}`}
                </span>
                <span
                  className={`font-mono text-2xl font-black tabular-nums ${
                    timeUp
                      ? "text-red-400"
                      : elapsed >= TARGET_SECONDS
                        ? "text-amber-300"
                        : "text-[var(--text-primary)]"
                  }`}
                >
                  {mmss(Math.min(elapsed, HARD_LIMIT_SECONDS))}
                </span>
              </div>

              {CRITERIA.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-3">
                    <label
                      htmlFor={c.key}
                      className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
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
                  className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
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
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui resize-none"
                />
              </div>

              {timeUp ? (
                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <p className="text-sm text-red-300 mb-4">
                    No score went in within {mmss(HARD_LIMIT_SECONDS)}, so this
                    table goes back to be judged by someone else.
                  </p>
                  <button
                    type="button"
                    disabled={busy || !current?.queueId}
                    onClick={() => {
                      setError("");
                      if (current?.queueId) skip.mutate({ queueId: current.queueId });
                    }}
                    className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
                  >
                    {skip.isPending ? "Loading…" : "Next table"}
                  </button>
                </div>
              ) : (
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[var(--border-subtle)]">
                <p className="text-xs text-[var(--text-muted)]">
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
                    className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest disabled:opacity-30"
                  >
                    {skip.isPending ? "Passing…" : "Pass on this table"}
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
                    className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
                  >
                    {complete.isPending ? "Saving…" : "Submit & Next"}
                  </button>
                </div>
              </div>
              )}
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
            // The card encodes the code on its own, which keeps the printed
            // QR as small and scannable as possible. The NFC link form
            // (...?table=<code>) is accepted too, in case one is printed.
            let code = raw.trim();
            try {
              code = new URL(code).searchParams.get("table") ?? code;
            } catch {
              // Not a URL: the bare code.
            }
            startByQr.mutate({ qrCode: code });
          }}
          onError={(e: unknown) => console.error(e)}
          isProcessing={startByQr.isPending}
          isPaused={startByQr.isPending}
        />
      )}
    </div>
  );
}
