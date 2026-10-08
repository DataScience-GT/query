"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import {
  READ_ONLY_TITLE,
  canViewAdmin,
  usePortalContext,
  useReadOnly,
} from "@/lib/use-portal-context";
import { useIsClient } from "@/lib/use-is-client";
import { useRouter, useSearchParams } from "next/navigation";
import { JudgingTools } from "@/components/admin/judging/JudgingTools";
import { RoomAssignmentsView } from "@/components/admin/judging/RoomAssignmentsView";
import { JudgeMatrixView } from "@/components/admin/judging/JudgeMatrixView";
import { RankingsView } from "@/components/admin/judging/RankingsView";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { JudgeLiveBoard } from "@/components/admin/hackathons/JudgeLiveBoard";
import { judgingPrepIsCurrent } from "@/lib/judging-prep";
import {
  body,
  btnPrimary,
  btnSecondary,
  kicker,
  meta,
  pageDek,
  status as statusClass,
} from "@/components/portal/ui";

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
  const readOnly = useReadOnly();

  // Get hackathons
  const { data: hackathons } = trpc.hackathon.list.useQuery(
    {},
    {
      enabled: !!session && canViewAdmin(portalContext),
    },
  );

  // Get rankings for selected hackathon
  const { data: panelConsole } = trpc.judge.panelConsole.useQuery(
    { hackathonId: selectedHackathon as string },
    { enabled: !!selectedHackathon },
  );

  const { data: rankings } = trpc.judge.getRankings.useQuery(
    { hackathonId: selectedHackathon as string },
    { enabled: !!selectedHackathon },
  );

  // Get judges
  const { data: judges } = trpc.judge.list.useQuery(undefined, {
    enabled: !!session && canViewAdmin(portalContext),
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
  const selectedHackathonRef = useRef(selectedHackathon);
  const prepGen = useRef(0);

  const promoteSubmissions = trpc.judge.promoteSubmissions.useMutation();

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
    setPrepState({ busy: false, error: null, message });
  };

  const prepareJudging = async () => {
    const hackathonId = selectedHackathon;
    if (!hackathonId) return;
    const gen = ++prepGen.current;
    setPrepState({ busy: true, message: null, error: null });
    try {
      const promoted = await promoteSubmissions.mutateAsync({
        hackathonId,
      });
      if (!stillThisRun(hackathonId, gen)) return;
      // No queues to build: judges draw from the pool of judgeable projects as
      // soon as judging is open, so syncing is the whole of preparing.
      await finishPrepare(
        hackathonId,
        gen,
        `Synced ${promoted.created} new submission(s) of ${promoted.total}. Judges draw tables from these as soon as judging is open. Print the table cards next.`,
      );
    } catch (e) {
      if (!stillThisRun(hackathonId, gen)) return;
      setPrepState({
        busy: false,
        message: null,
        error: e instanceof Error ? e.message : "Could not prepare judging.",
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

  // A new selection drops the previous edition's prep result.
  const [prepShownFor, setPrepShownFor] = useState(selectedHackathon);
  if (prepShownFor !== selectedHackathon) {
    setPrepShownFor(selectedHackathon);
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

  const selectedName = hackathons?.find((h) => h.id === selectedHackathon)
    ?.name;

  if (!mounted) return <LoadingScreen message="Loading judging…" />;

  return (
    <>
      <div className="relative z-10 max-w-7xl mx-auto">
        <header className="mb-10">
          {selectedName && <p className={`${kicker} mb-2`}>{selectedName}</p>}
          <h1 className="font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
            Judging results
          </h1>
          <p className={pageDek}>
            {!selectedHackathon
              ? "Pick a hackathon to see its results."
              : "Open and close judging, watch the floor, and compare scores."}
          </p>
          {panelConsole?.url ? (
            <a className={body} href={panelConsole.url}>
              Open the panel console
            </a>
          ) : null}
        </header>

        {/* Judging Control Panel */}
        {selectedHackathon && (
          <section className="mb-12 border-t border-[var(--border-subtle)] pt-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p
                  className={statusClass(judgingStatus?.active ? "accent" : "neutral")}
                >
                  {judgingStatus?.active ? "Judging is live" : "Judging is closed"}
                </p>
                <p className={`mt-1 ${body}`}>
                  {judgingStatus?.active
                    ? "Judges are scoring projects now."
                    : "Judges can't score until you start judging."}
                </p>
              </div>

              <button
                onClick={() =>
                  toggleJudging.mutate({
                    hackathonId: selectedHackathon,
                    active: !judgingStatus?.active,
                  })
                }
                disabled={readOnly || toggleJudging.isPending}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={`shrink-0 ${btnPrimary}`}
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
              <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
                {toggleJudging.error.message}
              </p>
            )}

            {/* Sync then assign, in that order, from the screen that starts
                judging — rather than two presses on a separate page. */}
            <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Prepare judging
                  </p>
                  <p className={`mt-1 ${meta}`}>
                    Syncs submissions into judging and gives each a table. Safe
                    to run again during judging: late submissions join the pool.
                  </p>
                </div>
                <button
                  onClick={prepareJudging}
                  disabled={readOnly || prepState.busy}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className={`shrink-0 ${btnSecondary}`}
                >
                  {prepState.busy ? "Preparing…" : "Prepare judging"}
                </button>
              </div>

              {prepState.message && (
                <p className={`mt-4 ${body}`}>{prepState.message}</p>
              )}
              {prepState.error && (
                <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
                  {prepState.error}
                </p>
              )}
            </div>
          </section>
        )}

        {selectedHackathon && (
          <div className="mb-12">
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
