"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import { useIsClient } from "@/lib/use-is-client";
import { useRouter, useSearchParams } from "next/navigation";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { JudgingTools } from "@/components/admin/judging/JudgingTools";
import { RoomAssignmentsView } from "@/components/admin/judging/RoomAssignmentsView";
import { JudgeMatrixView } from "@/components/admin/judging/JudgeMatrixView";
import { RankingsView } from "@/components/admin/judging/RankingsView";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { JudgeLiveBoard } from "@/components/admin/hackathons/JudgeLiveBoard";
import { judgingPrepIsCurrent } from "@/lib/judging-prep";

export default function AdminResultsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const mounted = useIsClient();
  // ?hackathonId= preselects the event, so the hackathon dashboard's
  // "Prepare judging" link lands on the right one.
  const searchParams = useSearchParams();
  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(
    searchParams.get("hackathonId"),
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedTrack, setSelectedTrack] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"results" | "rooms" | "judges">(
    "results",
  );

  const { data: portalContext } = usePortalContext();

  // Get hackathons
  const { data: hackathons } = trpc.hackathon.list.useQuery(
    {},
    {
      enabled: !!session && !!portalContext?.isAdmin,
    },
  );

  // Get rankings for selected hackathon
  const { data: rankings } = trpc.judge.getRankings.useQuery(
    { hackathonId: selectedHackathon as string },
    { enabled: !!selectedHackathon },
  );

  // Get judges
  const { data: judges } = trpc.judge.list.useQuery(undefined, {
    enabled: !!session && !!portalContext?.isAdmin,
  });

  // Judging active status
  const { data: judgingStatus, refetch: refetchJudgingStatus } =
    trpc.judge.getJudgingStatus.useQuery(
      { hackathonId: selectedHackathon as string },
      { enabled: !!selectedHackathon, refetchInterval: 10000 },
    );

  const toggleJudging = trpc.judge.toggleJudging.useMutation({
    onSuccess: () => refetchJudgingStatus(),
  });

  // Preparing judging was two presses on a separate page, in an order nothing
  // enforced: sync submissions, then build the queues. Doing them in the wrong
  // order leaves late projects in nobody's queue.
  const utils = trpc.useUtils();
  const [prepState, setPrepState] = useState<{
    busy: boolean;
    message: string | null;
    error: string | null;
  }>({ busy: false, message: null, error: null });
  // The edition whose assign call was refused. Rebuild anyway sends force
  // for this id, not whatever is selected now — a late CONFLICT from A must
  // not rebuild B.
  const [assignConflictId, setAssignConflictId] = useState<string | null>(
    null,
  );
  const selectedHackathonRef = useRef(selectedHackathon);
  const prepGen = useRef(0);

  const promoteSubmissions = trpc.judge.promoteSubmissions.useMutation();
  const assignJudges = trpc.judge.assignJudgesToProjects.useMutation();

  const isAssignConflict = (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    (error as { data?: { code?: string } }).data?.code === "CONFLICT";

  const stillThisRun = (hackathonId: string, gen: number) =>
    judgingPrepIsCurrent(
      hackathonId,
      gen,
      selectedHackathonRef.current,
      prepGen.current,
    );

  const finishPrepare = async (
    hackathonId: string,
    gen: number,
    message: string,
  ) => {
    // The live board and table cards read what prepare just built; neither
    // polls until judging is open.
    await Promise.all([
      utils.judge.getRankings.invalidate({ hackathonId }),
      utils.judge.liveProgress.invalidate(),
      utils.judge.tableCards.invalidate(),
    ]);
    if (!stillThisRun(hackathonId, gen)) return;
    await refetchJudgingStatus();
    if (!stillThisRun(hackathonId, gen)) return;
    setAssignConflictId(null);
    setPrepState({ busy: false, error: null, message });
  };

  const prepareJudging = async () => {
    const hackathonId = selectedHackathon;
    if (!hackathonId) return;
    const gen = ++prepGen.current;
    setAssignConflictId(null);
    setPrepState({ busy: true, message: null, error: null });
    try {
      const promoted = await promoteSubmissions.mutateAsync({
        hackathonId,
      });
      const assigned = await assignJudges.mutateAsync({
        hackathonId,
      });
      if (!stillThisRun(hackathonId, gen)) return;
      const warning = promoted.queuesNeedRebuild
        ? " One or more new projects carry a track no active judge covers — fix the track, then run this again."
        : "";
      await finishPrepare(
        hackathonId,
        gen,
        `Synced ${promoted.created} new submission(s) of ${promoted.total}, and built queues for ${assigned.totalJudges} judge(s) covering ${assigned.coverage.min}-${assigned.coverage.max} projects each. Print the table cards next.${warning}`,
      );
    } catch (e) {
      if (!stillThisRun(hackathonId, gen)) return;
      setAssignConflictId(isAssignConflict(e) ? hackathonId : null);
      setPrepState({
        busy: false,
        message: null,
        error: e instanceof Error ? e.message : "Could not prepare judging.",
      });
    }
  };

  // The server names how many completed slots (or that judging is live) and
  // asks for confirmation. This is the only control that sends force: true —
  // /admin/setup used to, and now redirects here.
  const rebuildQueuesAnyway = async () => {
    const hackathonId = assignConflictId;
    if (!hackathonId || hackathonId !== selectedHackathonRef.current) return;
    const gen = ++prepGen.current;
    setPrepState((s) => ({ ...s, busy: true }));
    try {
      const assigned = await assignJudges.mutateAsync({
        hackathonId,
        force: true,
      });
      if (!stillThisRun(hackathonId, gen)) return;
      await finishPrepare(
        hackathonId,
        gen,
        `Rebuilt queues for ${assigned.totalJudges} judge(s) covering ${assigned.coverage.min}-${assigned.coverage.max} projects each. Completed slots were kept.`,
      );
    } catch (e) {
      if (!stillThisRun(hackathonId, gen)) return;
      setAssignConflictId(isAssignConflict(e) ? hackathonId : null);
      setPrepState({
        busy: false,
        message: null,
        error: e instanceof Error ? e.message : "Could not rebuild queues.",
      });
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(loginHref());
    }
  }, [status, router]);

  // Auto-select first hackathon
  if (hackathons?.[0] && !selectedHackathon) {
    setSelectedHackathon(hackathons[0].id);
  }

  // A new selection drops the previous edition's prep result and conflict.
  const [prepShownFor, setPrepShownFor] = useState(selectedHackathon);
  if (prepShownFor !== selectedHackathon) {
    setPrepShownFor(selectedHackathon);
    setAssignConflictId(null);
    setPrepState({ busy: false, message: null, error: null });
  }

  // Covers the auto-select above, which runs before any prep can start.
  useEffect(() => {
    selectedHackathonRef.current = selectedHackathon;
  }, [selectedHackathon]);

  // The ref and generation move here, in the click, before B renders: a run
  // still in flight for A fails stillThisRun from this moment, so its result
  // cannot land on B's panel. Re-selecting the current edition is a no-op, so
  // it cannot orphan that edition's own run with busy stuck on.
  const selectHackathon = (id: string) => {
    if (id === selectedHackathonRef.current) return;
    selectedHackathonRef.current = id;
    prepGen.current += 1;
    setSelectedHackathon(id);
  };

  const categories = useMemo(() => {
    if (!rankings?.rankings) return ["ALL"];
    const cats = new Set(
      rankings.rankings
        .map((r) => r.project.category)
        .filter((c): c is string => !!c),
    );
    return ["ALL", ...Array.from(cats)];
  }, [rankings]);

  const tracks = useMemo(() => {
    if (!rankings?.rankings) return ["ALL"];
    const ts = new Set<string>();
    rankings.rankings.forEach((r) => {
      r.project.tracks?.forEach((t) => ts.add(t));
      r.project.challenges?.forEach((c) => ts.add(c.toUpperCase()));
      if (r.project.isCreateX) ts.add("CREATE-X");
    });
    return ["ALL", ...Array.from(ts)];
  }, [rankings]);

  const processedRankings = useMemo(() => {
    if (!rankings?.rankings) return [];

    let filtered = rankings.rankings;

    if (selectedCategory !== "ALL") {
      filtered = filtered.filter(
        (r) => r.project.category === selectedCategory,
      );
    }

    if (selectedTrack !== "ALL") {
      filtered = filtered.filter(
        (r) =>
          r.project.tracks?.includes(selectedTrack) ||
          r.project.challenges?.some(
            (c) => c.toUpperCase() === selectedTrack,
          ) ||
          (selectedTrack === "CREATE-X" && r.project.isCreateX),
      );
    }

    // Calculate display score based on track
    return filtered
      .map((r) => {
        return {
          ...r,
          displayScore: r.weightedScore,
        };
      })
      .sort((a, b) => b.displayScore - a.displayScore);
  }, [rankings, selectedCategory, selectedTrack]);

  if (!mounted) return <LoadingScreen message="Loading judging…" />;

  return (
    <>
      <div className="relative z-10 max-w-7xl mx-auto">
        <header className="mb-10">
          <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-2">
            Admin
          </p>
          <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Judging results
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {!selectedHackathon
              ? "Pick a hackathon to see its results."
              : judgingStatus?.active
                ? "Judging is live."
                : "Judging is closed."}
          </p>
        </header>

        {/* Judging Control Panel */}
        {selectedHackathon && (
          <LiquidGlass
            printed
            className={`p-6 mb-12 relative border-t-4 ${
              judgingStatus?.active
                ? "border-t-accent"
                : "border-t-[var(--border-medium)]"
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    judgingStatus?.active
                      ? "bg-accent"
                      : "bg-[var(--text-subtle)]"
                  }`}
                />
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
                    {judgingStatus?.active ? "Judging live" : "Judging closed"}
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    {judgingStatus?.active
                      ? "Judges are scoring projects now."
                      : "Judges can't score until you start judging."}
                  </p>
                </div>
              </div>

              <button
                onClick={() =>
                  toggleJudging.mutate({
                    hackathonId: selectedHackathon,
                    active: !judgingStatus?.active,
                  })
                }
                disabled={toggleJudging.isPending}
                className={
                  judgingStatus?.active
                    ? "px-6 py-3 rounded-sm border border-amber-500/40 bg-amber-500/10 text-amber-400 font-bold text-sm uppercase tracking-widest hover:bg-amber-500/20 transition-ui disabled:opacity-50"
                    : "px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
                }
              >
                {toggleJudging.isPending
                  ? "Saving…"
                  : judgingStatus?.active
                    ? "End judging"
                    : "Start judging"}
              </button>
            </div>
            {/* Starting is refused until queues exist; without this the
                press looks like a no-op. Scoped to the event it was for. */}
            {toggleJudging.error &&
              toggleJudging.variables?.hackathonId === selectedHackathon && (
              <p
                role="alert"
                className="mt-4 px-4 py-3 rounded-sm text-sm border border-red-500/30 bg-red-500/10 text-red-300"
              >
                {toggleJudging.error.message}
              </p>
            )}

            {/* Sync then assign, in that order, from the screen that starts
                judging — rather than two presses on a separate page. */}
            <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    Prepare judging
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Syncs submissions into judging and builds every judge&apos;s
                    queue. Run it before starting, and again after late
                    submissions.
                  </p>
                </div>
                <button
                  onClick={prepareJudging}
                  disabled={prepState.busy || judgingStatus?.active}
                  title={
                    judgingStatus?.active
                      ? "End judging first — rebuilding queues mid-session would reorder what judges are working through."
                      : undefined
                  }
                  className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors disabled:opacity-40"
                >
                  {prepState.busy ? "Preparing…" : "Prepare judging"}
                </button>
              </div>

              {prepState.message && (
                <p className="mt-4 px-4 py-3 rounded-sm border border-accent/30 bg-accent/10 text-sm text-accent">
                  {prepState.message}
                </p>
              )}
              {prepState.error && (
                <div
                  role="alert"
                  className={`mt-4 px-4 py-3 rounded-sm text-sm ${
                    assignConflictId === selectedHackathon
                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-200"
                      : "border border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  <p>{prepState.error}</p>
                  {assignConflictId === selectedHackathon && (
                    <button
                      type="button"
                      onClick={rebuildQueuesAnyway}
                      disabled={prepState.busy}
                      className="mt-4 px-6 py-3 bg-amber-500/10 border border-amber-500/40 text-amber-200 font-bold text-xs uppercase tracking-widest rounded-sm hover:bg-amber-500/20 transition-ui disabled:opacity-40"
                    >
                      {prepState.busy ? "Rebuilding…" : "Rebuild anyway"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </LiquidGlass>
        )}

        {selectedHackathon && (
          <div className="mt-6">
            <JudgeLiveBoard
              hackathonId={selectedHackathon}
              active={!!judgingStatus?.active}
            />
          </div>
        )}

        {/* Judging Tools */}
        <JudgingTools
          hackathons={hackathons || []}
          selectedHackathon={selectedHackathon}
          setSelectedHackathon={selectHackathon}
          viewMode={viewMode}
          setViewMode={setViewMode}
          categories={categories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          tracks={tracks}
          selectedTrack={selectedTrack}
          setSelectedTrack={setSelectedTrack}
        />

        {/* ===== ROOMS VIEW ===== */}
        {viewMode === "rooms" && rankings && (
          <RoomAssignmentsView rankings={rankings} />
        )}

        {/* ===== JUDGES VIEW ===== */}
        {viewMode === "judges" && rankings && (
          <JudgeMatrixView rankings={rankings} />
        )}

        {viewMode === "results" && (
          <RankingsView
            rankings={rankings || null}
            processedRankings={processedRankings}
            selectedTrack={selectedTrack}
            judges={judges || []}
            selectedHackathon={selectedHackathon}
          />
        )}
      </div>
    </>
  );
}
