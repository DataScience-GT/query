"use client";

import React, { useEffect, useRef, useState } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { QRScannerModal } from "@/components/portal/QRScannerModal";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import { AlertCircle } from "lucide-react";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  kicker,
  meta,
  page,
  pageDek,
  pageTitle,
  textLink,
} from "@/components/portal/ui";

const BACK_LINK =
  "inline-flex min-h-11 items-center text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors";

/** One full-page message (not found, not approved, not open): a headline,
 *  a sentence, and the actions under it. */
function Notice({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <main className={page}>
      <Link href="/judge" className={BACK_LINK}>
        ← Judging
      </Link>
      <div className="mt-4 max-w-xl">
        <h1 className={pageTitle}>{title}</h1>
        <p className={pageDek}>{children}</p>
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
          {actions}
        </div>
      </div>
    </main>
  );
}

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
      <Notice
        title="Hackathon not found"
        actions={
          <Link href="/judge" className={`min-h-11 ${btnSecondary}`}>
            Back to judging
          </Link>
        }
      >
        {resolved.error?.message ?? "That hackathon does not exist."}
      </Notice>
    );
  }

  if (judgeCheck.isPending) {
    return <LoadingScreen message="Checking access…" />;
  }

  if (judgeCheck.data && !judgeCheck.data.isJudge) {
    return (
      <Notice
        title="You're not approved to judge yet"
        actions={
          <Link href="/judge" className={`min-h-11 ${btnSecondary}`}>
            Back to judging
          </Link>
        }
      >
        An organiser has not approved your judge application for this
        hackathon yet. You&apos;ll get an email when they do.
      </Notice>
    );
  }

  if (judgingStatus.isPending) {
    return <LoadingScreen message="Checking judging status…" />;
  }

  // Said before a table is handed out, not after a score is lost.
  if (!judgingOpen) {
    return (
      <Notice
        title="Judging has not opened yet"
        actions={
          <>
            <button
              type="button"
              onClick={() => judgingStatus.refetch()}
              className={`min-h-11 ${btnPrimary}`}
            >
              Check again
            </button>
            <Link href="/judge" className={`min-h-11 ${textLink}`}>
              Back to judging
            </Link>
          </>
        }
      >
        Your queue is waiting. An organiser opens scoring when the expo
        begins; check again then.
      </Notice>
    );
  }

  if (nextTable.isPending && !current) {
    return <LoadingScreen message="Finding your next table…" />;
  }

  // A failed lookup must not fall through to the "All Done" card below — a
  // judge told they have finished walks away with their queue unscored.
  if (nextTable.error && !current) {
    return (
      <Notice
        title="Your queue didn't load"
        actions={
          <button
            type="button"
            onClick={() => nextTable.refetch()}
            className={`min-h-11 ${btnPrimary}`}
          >
            Try again
          </button>
        }
      >
        {nextTable.error.message}
      </Notice>
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
    <div className="pb-24">
      <main className={page}>
        <div className="flex items-center justify-between gap-4">
          <Link href="/judge" className={BACK_LINK}>
            ← Judging
          </Link>
          {progress.data && (
            <p className={`tabular-nums ${meta}`}>
              {progress.data.completed} judged
            </p>
          )}
        </div>

        {/* No progress bar: judges draw from a shared pool, so a share of
            every eligible project says nothing about how a judge is doing. */}

        {error && (
          <div className="mt-6 flex items-start gap-2.5 border-l-2 border-[var(--danger)] py-1 pl-3">
            <AlertCircle
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="mt-1 shrink-0 text-[var(--danger)]"
            />
            <p className="text-[15px] text-[var(--danger)]">{error}</p>
          </div>
        )}

        {done || !project ? (
          // An empty queue is not a finished one: "All done, 0 of 0" told a
          // judge with nothing assigned that they had judged everything. Nor is
          // an unknown one: "All done" waits until progress says there was work.
          <div className="mt-6 max-w-xl">
            <h1 className={pageTitle}>
              {progress.data?.total === 0
                ? "No tables yet"
                : (progress.data?.total ?? 0) > 0
                  ? "All done"
                  : "Your queue"}
            </h1>
            <p className={pageDek}>
              {progress.data?.total === 0
                ? "There are no projects for you to judge yet. Tell an organiser."
                : (progress.data?.total ?? 0) > 0
                  ? "You have been to every project you can judge. Thank you."
                  : progress.isError
                    ? "Couldn't load your progress. Refresh the page."
                    : "Loading your queue…"}
            </p>
          </div>
        ) : (
          <>
            <header className="mt-6">
              {project.tableNumber != null && (
                <p className={`tabular-nums ${kicker}`}>
                  Table {project.tableNumber}
                </p>
              )}
              <h1 className={`mt-1 break-words ${pageTitle}`}>
                {project.name}
              </h1>
              {project.description && (
                <p className={`mt-3 max-w-2xl ${body}`}>
                  {project.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-6">
                {[
                  { href: project.githubUrl, label: "Repository" },
                  { href: project.demoUrl, label: "Live demo" },
                  { href: project.videoUrl, label: "Video" },
                ]
                  .filter((l) => !!l.href)
                  .map((l) => (
                    <a
                      key={l.label}
                      href={l.href as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`min-h-11 ${textLink}`}
                    >
                      {l.label}
                    </a>
                  ))}
              </div>
            </header>

            {/* The scoring form stays shut until the table card is scanned.
                Opening it earlier is what let the clock run across the walk,
                and let a judge score a table they never actually reached. */}
            {!arrived ? (
              <section className="mt-8 max-w-xl border-t border-[var(--border-subtle)] pt-6">
                <h2 className={itemTitle}>Scan the team&apos;s code to begin</h2>
                <p className={`mt-2 ${body}`}>
                  Walk to table{" "}
                  <span className="tabular-nums">
                    {project.tableNumber ?? "?"}
                  </span>{" "}
                  and tap your phone on the NFC tag, or scan the card on their
                  desk. Your judging time starts then, not when this table was
                  assigned to you.
                </p>
                <div className="mt-6 flex flex-col items-stretch sm:items-start gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setShowScanner(true);
                    }}
                    disabled={startByQr.isPending}
                    className={`min-h-12 w-full sm:w-auto ${btnPrimary}`}
                  >
                    {startByQr.isPending ? "Starting…" : "Scan table code"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !current?.queueId}
                    onClick={() => {
                      setError("");
                      if (current?.queueId) skip.mutate({ queueId: current.queueId });
                    }}
                    className="min-h-11 text-left text-sm text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                  >
                    Can&apos;t find the team? Get another table
                  </button>
                </div>
              </section>
            ) : (
            <section className="mt-8 max-w-2xl">
              {/* The clock runs from the tap or scan. Amber at 3:00; at 4:00
                  the form locks and the table goes back into the pool. */}
              <div
                role="timer"
                aria-live="off"
                className={`flex items-center justify-between gap-4 border-y py-3 ${
                  timeUp
                    ? "border-[var(--danger)]"
                    : elapsed >= TARGET_SECONDS
                      ? "border-[var(--warning)]"
                      : "border-[var(--border-subtle)]"
                }`}
              >
                <span
                  className={`text-sm font-semibold ${
                    timeUp
                      ? "text-[var(--danger)]"
                      : elapsed >= TARGET_SECONDS
                        ? "text-[var(--warning)]"
                        : "text-[var(--text-muted)]"
                  }`}
                >
                  {timeUp
                    ? "Time's up"
                    : elapsed >= TARGET_SECONDS
                      ? `Wrap up: score locks at ${mmss(HARD_LIMIT_SECONDS)}`
                      : `Aim for ${mmss(TARGET_SECONDS)}`}
                </span>
                <span
                  className={`font-[family-name:var(--font-display)] text-[32px] font-semibold leading-none tabular-nums ${
                    timeUp
                      ? "text-[var(--danger)]"
                      : elapsed >= TARGET_SECONDS
                        ? "text-[var(--warning)]"
                        : "text-[var(--text-primary)]"
                  }`}
                >
                  {mmss(Math.min(elapsed, HARD_LIMIT_SECONDS))}
                </span>
              </div>

              <div className="divide-y divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">
                {CRITERIA.map((c) => (
                  <div key={c.key} className="py-3">
                    <div className="flex items-baseline justify-between">
                      <label
                        htmlFor={c.key}
                        className="text-[15px] font-semibold text-[var(--text-primary)]"
                      >
                        {c.label}
                      </label>
                      <span className="font-[family-name:var(--font-display)] text-[22px] font-semibold tabular-nums text-[var(--text-primary)]">
                        {scores[c.key]}
                        <span className={`ml-0.5 font-sans ${meta}`}>/10</span>
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
                      className="block h-11 w-full cursor-pointer accent-[var(--accent)]"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <label htmlFor="comment" className={fieldLabel}>
                  Notes (optional)
                </label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="What stood out?"
                  className={`${input} resize-none`}
                />
              </div>

              {timeUp ? (
                <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                  <p className="text-[15px] text-[var(--danger)] mb-4">
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
                    className={`min-h-12 w-full sm:w-auto ${btnPrimary}`}
                  >
                    {skip.isPending ? "Loading…" : "Next table"}
                  </button>
                </div>
              ) : (
              <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-[var(--border-subtle)]">
                <p className={meta}>
                  Total{" "}
                  <span className="font-[family-name:var(--font-display)] text-[28px] font-semibold tabular-nums text-[var(--text-primary)]">
                    {total}
                  </span>{" "}
                  <span className="tabular-nums">/ 50</span>
                </p>
                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    type="button"
                    disabled={busy || !current?.queueId}
                    onClick={() => {
                      setError("");
                      if (current?.queueId)
                        skip.mutate({ queueId: current.queueId });
                    }}
                    className={`min-h-11 ${btnSecondary}`}
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
                    className={`min-h-12 ${btnPrimary}`}
                  >
                    {complete.isPending ? "Saving…" : "Submit score"}
                  </button>
                </div>
              </div>
              )}
            </section>
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
