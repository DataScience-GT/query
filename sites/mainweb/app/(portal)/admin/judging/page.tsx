"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Zap } from "lucide-react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import { useRouter } from "next/navigation";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { JudgingTools } from "@/components/admin/judging/JudgingTools";
import { RoomAssignmentsView } from "@/components/admin/judging/RoomAssignmentsView";
import { JudgeMatrixView } from "@/components/admin/judging/JudgeMatrixView";
import { RankingsView } from "@/components/admin/judging/RankingsView";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { JudgeLiveBoard } from "@/components/admin/hackathons/JudgeLiveBoard";

export default function AdminResultsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(
    null,
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
  // Set only when assignJudgesToProjects itself refused. A failed promote
  // must not relabel into a button that sends force: true.
  const [assignConflict, setAssignConflict] = useState(false);

  const promoteSubmissions = trpc.judge.promoteSubmissions.useMutation();
  const assignJudges = trpc.judge.assignJudgesToProjects.useMutation();

  const isAssignConflict = (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    (error as { data?: { code?: string } }).data?.code === "CONFLICT";

  const finishPrepare = async (message: string) => {
    if (!selectedHackathon) return;
    await utils.judge.getRankings.invalidate({
      hackathonId: selectedHackathon,
    });
    await refetchJudgingStatus();
    setAssignConflict(false);
    setPrepState({ busy: false, error: null, message });
  };

  const prepareJudging = async () => {
    if (!selectedHackathon) return;
    setAssignConflict(false);
    setPrepState({ busy: true, message: null, error: null });
    try {
      const promoted = await promoteSubmissions.mutateAsync({
        hackathonId: selectedHackathon,
      });
      const assigned = await assignJudges.mutateAsync({
        hackathonId: selectedHackathon,
      });
      const warning = promoted.queuesNeedRebuild
        ? " One or more new projects carry a track no active judge covers — fix the track, then run this again."
        : "";
      await finishPrepare(
        `Synced ${promoted.created} new submission(s) of ${promoted.total}, and built queues for ${assigned.totalJudges} judge(s) covering ${assigned.coverage.min}-${assigned.coverage.max} projects each. Print the table cards next.${warning}`,
      );
    } catch (e) {
      setAssignConflict(isAssignConflict(e));
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
    if (!selectedHackathon) return;
    setPrepState((s) => ({ ...s, busy: true }));
    try {
      const assigned = await assignJudges.mutateAsync({
        hackathonId: selectedHackathon,
        force: true,
      });
      await finishPrepare(
        `Rebuilt queues for ${assigned.totalJudges} judge(s) covering ${assigned.coverage.min}-${assigned.coverage.max} projects each. Completed slots were kept.`,
      );
    } catch (e) {
      setAssignConflict(isAssignConflict(e));
      setPrepState({
        busy: false,
        message: null,
        error: e instanceof Error ? e.message : "Could not rebuild queues.",
      });
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Auto-select first hackathon
  useEffect(() => {
    if (hackathons?.[0] && !selectedHackathon) {
      setSelectedHackathon(hackathons[0].id);
    }
  }, [hackathons, selectedHackathon]);

  useEffect(() => {
    setAssignConflict(false);
    setPrepState({ busy: false, message: null, error: null });
  }, [selectedHackathon]);

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
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-18%] left-[-8%] w-[800px] h-[800px] bg-gradient-to-r from-accent/8 via-emerald-900/15 to-purple-900/12 blur-[400px] rounded-sm" />
          <div className="absolute bottom-[-12%] right-[-10%] w-[700px] h-[700px] bg-gradient-to-r from-emerald-900/15 via-emerald-900/12 to-indigo-900/10 blur-[350px] rounded-sm" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.06)_0%,transparent_70%)]" />
        </div>

        {/* Header - Enhanced */}
        <div className="relative mb-16 p-8 border border-[var(--border-subtle)] bg-gradient-to-br from-accent/10 via-emerald-900/8 to-transparent rounded-none overflow-hidden group hover:border-accent/40 transition-ui duration-500">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-accent/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-accent/15 rounded-sm blur-[150px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-purple-900/15 rounded-sm blur-[150px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-150" />

          <div className="relative">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-none bg-gradient-to-br from-accent/20 to-accent/15 border border-accent/30 shadow-[4px_4px_0_0_var(--accent)]">
                <svg
                  className="w-8 h-8 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
                  <Zap className="w-3 h-3" /> Hackathon Hub
                </p>
                <h1 className="text-6xl font-black text-[var(--text-primary)] uppercase tracking-tighter mb-1 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-emerald-100 to-gray-400 transition-ui duration-500">
                  Voting <span className="text-accent italic">Results</span>
                </h1>
                <p className="text-sm font-mono text-text-muted uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-sm bg-accent animate-pulse shadow-[0_0_8px_var(--accent)]" />
                  Data Evaluation Layer //{" "}
                  {selectedHackathon ? "SYNC ACTIVE" : "IDLE"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Judging Control Panel - Enhanced */}
        {selectedHackathon && (
          <LiquidGlass
            className={`rounded-none p-8 mb-12 relative overflow-hidden border-t-4 transition-ui duration-500 ${
              judgingStatus?.active
                ? "border-accent shadow-[0_0_40px_rgba(16,185,129,0.15)]"
                : "border-gray-700"
            }`}
          >
            {/* Background gradients */}
            {/* Decorative only. Without pointer-events-none it is an absolutely
                positioned layer painting above every static sibling that
                follows it, which swallowed the clicks on the controls below. */}
            <div
              aria-hidden="true"
              className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${judgingStatus?.active ? "opacity-100" : "opacity-0"}`}
            >
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-emerald-900/10 via-transparent to-transparent" />
              <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent/10 rounded-sm blur-[120px]" />
              <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/8 rounded-sm blur-[120px]" />
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-5">
                <div
                  className={`w-16 h-16 rounded-none flex items-center justify-center transition-ui duration-500 ${
                    judgingStatus?.active
                      ? "bg-accent/20 border border-accent/40 shadow-[0_0_25px_rgba(16,185,129,0.3)]"
                      : "bg-white/5 border border-[var(--border-subtle)]"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-sm transition-ui duration-500 ${
                      judgingStatus?.active
                        ? "bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.8)] animate-pulse"
                        : "bg-gray-600"
                    }`}
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tight">
                    Judging{" "}
                    {judgingStatus?.active ? (
                      <span className="text-accent italic">Active</span>
                    ) : (
                      <span className="text-text-muted italic">Inactive</span>
                    )}
                  </h2>
                  <p className="text-xs font-mono text-text-muted uppercase tracking-widest mt-1">
                    {judgingStatus?.active
                      ? "Judges are currently scoring projects in real-time"
                      : "Judges are on standby — waiting for you to begin"}
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
                className={`px-12 py-6 font-black text-lg uppercase tracking-widest transition-ui rounded-none font-mono border-2 disabled:opacity-50 ${
                  judgingStatus?.active
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/60 shadow-[0_0_30px_rgba(245,158,11,0.1)]"
                    : "bg-accent/10 border-accent/40 text-accent hover:bg-accent/20 hover:border-accent/60 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
                }`}
              >
                {toggleJudging.isPending
                  ? "Processing…"
                  : judgingStatus?.active
                    ? "END JUDGING"
                    : "START JUDGING"}
              </button>
            </div>

            {/* Sync then assign, in that order, from the screen that starts
                judging — rather than two presses on a separate page. */}
            <div className="relative z-10 mt-8 pt-6 border-t border-[var(--border-subtle)]">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    Prepare judging
                  </p>
                  <p className="text-xs font-mono text-text-muted mt-1">
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
                  className="shrink-0 px-8 py-4 border-2 border-accent/40 bg-accent/10 text-accent font-black text-sm uppercase tracking-widest rounded-none hover:bg-accent/20 transition-ui disabled:opacity-40"
                >
                  {prepState.busy ? "Preparing…" : "Prepare Judging"}
                </button>
              </div>

              {prepState.message && (
                <p className="mt-4 px-4 py-3 border border-accent/30 bg-accent/10 text-sm font-mono text-accent">
                  {prepState.message}
                </p>
              )}
              {prepState.error && (
                <div
                  role="alert"
                  className={`mt-4 px-4 py-3 text-sm font-mono ${
                    assignConflict
                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-200"
                      : "border border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  <p>{prepState.error}</p>
                  {assignConflict && (
                    <button
                      type="button"
                      onClick={rebuildQueuesAnyway}
                      disabled={prepState.busy}
                      className="mt-4 px-6 py-3 bg-amber-500/10 border border-amber-500/40 text-amber-200 font-bold text-xs uppercase tracking-widest rounded-none hover:bg-amber-500/20 transition-ui font-mono disabled:opacity-40"
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
          setSelectedHackathon={setSelectedHackathon}
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
