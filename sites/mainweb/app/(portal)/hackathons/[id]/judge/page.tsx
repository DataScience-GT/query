"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";

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
  const hackathonId = params.id as string;

  const [current, setCurrent] = useState<{
    project: Project | null;
    queueId: string | null;
  } | null>(null);
  const [scores, setScores] = useState<Scores>(BLANK);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  const judgeCheck = trpc.judge.isJudge.useQuery(
    { hackathonId },
    { enabled: !!session },
  );

  /**
   * Fetched once, not polled. Every call re-claims a table, so a background
   * refetch could hand the judge a different project mid-score; the mutations
   * below already return the next one.
   */
  const nextTable = trpc.judge.getNextTable.useQuery(
    { hackathonId },
    {
      enabled: !!session && judgeCheck.data?.isJudge === true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  const progress = trpc.judge.getProgress.useQuery(
    { hackathonId },
    { enabled: !!session && judgeCheck.data?.isJudge === true },
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

  const advance = (project: Project | null, queueId: string | null) => {
    setScores(BLANK);
    setComment("");
    setError("");
    setStartedAt(Date.now());
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

  const skip = trpc.judge.skipProject.useMutation({
    onSuccess: (res) => {
      advance((res.project as Project) ?? null, res.queueId ?? null);
    },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading" || judgeCheck.isPending) {
    return <LoadingScreen message="Verifying Judge Access..." />;
  }
  if (!session) return null;

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

  if (nextTable.isPending && !current) {
    return <LoadingScreen message="Finding your next table..." />;
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
  const busy = complete.isPending || skip.isPending;

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
              className="h-full bg-accent transition-all duration-500"
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
                    {skip.isPending ? "Skipping..." : "Skip for now"}
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
                    {complete.isPending ? "Saving..." : "Submit & Next"}
                  </button>
                </div>
              </div>
            </LiquidGlass>
          </>
        )}
      </main>
    </div>
  );
}
