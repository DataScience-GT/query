"use client";

import React, { useState } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { UserPlus, Gavel } from "lucide-react";

export function JudgesTab({ hackathonId }: { hackathonId: string }) {
  const utils = trpc.useUtils();

  // Scoped to this hackathon: a judges row belongs to one edition, and
  // assignToHackathon rejects any judge from another — so an unscoped list
  // could only ever populate the picker with judges the server refuses.
  const { data: allJudges, isLoading: judgesLoading } = trpc.judge.list.useQuery(
    { hackathonId },
  );
  const { data: judgingStatus } = trpc.judge.getJudgingStatus.useQuery({
    hackathonId,
  });
  const { data: rankings } = trpc.judge.getRankings.useQuery({ hackathonId });

  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);

  const toggleJudging = trpc.judge.toggleJudging.useMutation({
    onSuccess: () => {
      utils.judge.getJudgingStatus.invalidate({ hackathonId });
      setJudgeError(null);
    },
    // The judges' scoring screens gate on this flag, so a silent failure here
    // leaves every judge staring at "Judging Not Open" while the organiser
    // believes they opened it.
    onError: (error) => setJudgeError(error.message),
  });

  const assignJudge = trpc.judge.assignToHackathon.useMutation({
    onSuccess: () => {
      utils.judge.list.invalidate();
      setJudgeError(null);
    },
    onError: (error) => setJudgeError(error.message),
  });

  // The edition's own tracks and challenges. Judging routes on an exact string
  // match, so any other value classifies the judge as sponsor/special and
  // empties their pool — which is why this is a picker and not a text box.
  const { data: hackathon } = trpc.hackathon.getById.useQuery({
    id: hackathonId,
  });
  const trackOptions = [
    ...(hackathon?.tracks ?? []),
    ...(hackathon?.challenges ?? []),
  ];

  // Judges who applied through /judge/register arrive inactive; this is the
  // only thing that approves them.
  const setActive = trpc.judge.setActive.useMutation({
    onSuccess: (result) => {
      utils.judge.list.invalidate();
      setJudgeError(null);
      // Approval builds the queue when there isn't one. Saying so is the
      // difference between "approved" and "approved and ready to judge" —
      // organisers previously had to re-run the whole assignment step to find
      // out, and that step is unsafe once judging is live.
      setQueueNotice(
        result.queuedProjects === null
          ? null
          : result.queuedProjects > 0
            ? `Queue built: ${result.queuedProjects} project(s).`
            : "Approved, but no project matched this judge's track — check their track below.",
      );
    },
    // Approving a judge is what lets them open the portal at all. Failing
    // silently leaves the badge on "Inactive", indistinguishable from not
    // having clicked.
    onError: (error) => setJudgeError(error.message),
  });

  /**
   * Set only when the SERVER refused a track change because the judge has
   * already scored. Holding the attempt lets the override re-send exactly what
   * was refused — and keeping it separate from judgeError means an unrelated
   * failure cannot relabel the button into one that sends force: true.
   */
  const [trackConflict, setTrackConflict] = useState<{
    judgeId: string;
    track: string | null;
    message: string;
  } | null>(null);

  const updateTrack = trpc.judge.updateAssignmentTrack.useMutation({
    onSuccess: (result) => {
      utils.judge.list.invalidate();
      setJudgeError(null);
      setTrackConflict(null);
      setQueueNotice(
        result.message ??
          (result.queueRebuilt
            ? `Track updated — queue rebuilt with ${result.projectCount} project(s).`
            : "Track updated."),
      );
    },
    onError: (error, variables) => {
      if (error.data?.code === "CONFLICT") {
        // Refused, not failed: the judge has scored, and the organiser has to
        // read what changing the track costs before it happens.
        setTrackConflict({
          judgeId: variables.judgeId,
          track: variables.track,
          message: error.message,
        });
        setJudgeError(null);
        return;
      }
      setTrackConflict(null);
      setJudgeError(error.message);
    },
  });

  const { data: resultsDraft } = trpc.judge.getResultsDraft.useQuery({
    hackathonId,
  });

  const [resultsError, setResultsError] = useState<string | null>(null);
  /**
   * Set only when COMPUTE itself was refused.
   *
   * Kept separate from resultsError because that is written by all three
   * mutations: a failed publish or unpublish would otherwise relabel Compute
   * to "Compute anyway" and send force: true, bypassing the judging-is-live
   * guard without the admin ever having seen the refusal it is overriding.
   */
  const [computeConflict, setComputeConflict] = useState(false);

  const refreshResults = () => {
    utils.judge.getResultsDraft.invalidate({ hackathonId });
    setResultsError(null);
    setComputeConflict(false);
  };

  const computeResults = trpc.judge.computeResults.useMutation({
    onSuccess: refreshResults,
    // Refuses while judging is live, and says why. Forcing is offered only
    // after that has been read.
    onError: (error) => {
      setResultsError(error.message);
      setComputeConflict(error.data?.code === "CONFLICT");
    },
  });

  const publishResults = trpc.judge.publishResults.useMutation({
    onSuccess: refreshResults,
    onError: (error) => setResultsError(error.message),
  });

  const unpublishResults = trpc.judge.unpublishResults.useMutation({
    onSuccess: refreshResults,
    onError: (error) => setResultsError(error.message),
  });

  const isPublished = resultsDraft?.some((row) => row.publishedAt) ?? false;
  const hasDraft = (resultsDraft?.length ?? 0) > 0;

  /**
   * Publishing puts the results on the public tab and tells nobody.
   *
   * Built on the same announcement machinery as the Email tab rather than a
   * second send path, so this one is resumable too: the recipients are recorded
   * server-side and a closed tab continues instead of re-mailing everyone.
   */
  const createAnnouncement = trpc.hackathon.createAnnouncement.useMutation();
  const sendBatch = trpc.hackathon.sendBatch.useMutation();
  const [announcing, setAnnouncing] = useState(false);

  const announceResults = async () => {
    const name = hackathon?.name ?? "the hackathon";
    if (
      !window.confirm(
        `Email everyone registered for ${name} that the results are live?\n\nThis cannot be unsent.`,
      )
    )
      return;

    setAnnouncing(true);
    setQueueNotice(null);
    try {
      const created = await createAnnouncement.mutateAsync({
        hackathonId,
        audience: "registered",
        subject: `${name} results are live`,
        heading: "Results are live",
        body: `Judging for ${name} is finished and the results are published.\n\nThank you for building with us.`,
        ctaLabel: "See the results",
        ctaUrl: `${window.location.origin}/hackathons/${hackathonId}`,
      });

      let sent = 0;
      for (let guard = 0; guard < 100; guard++) {
        const result = await sendBatch.mutateAsync({
          announcementId: created.announcementId,
        });
        sent += result.sent;
        setQueueNotice(
          `Announcing results: ${sent} of ${created.totalRecipients} sent…`,
        );
        if (result.done) break;
        if (result.sent === 0 && result.failed.length === 0) break;
      }
      setQueueNotice(
        `Results announced to ${sent} recipient(s). Unfinished sends can be resumed from the Email tab.`,
      );
    } catch (error) {
      setJudgeError(
        error instanceof Error ? error.message : "Announcement failed",
      );
    } finally {
      setAnnouncing(false);
    }
  };

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedJudgeId, setSelectedJudgeId] = useState("");
  const [assignTrack, setAssignTrack] = useState("");

  // Find judges assigned to THIS hackathon
  const assignedJudges =
    allJudges?.filter((j) =>
      j.assignments.some((a) => a.hackathon?.id === hackathonId),
    ) || [];

  // Find judges NOT yet assigned to this hackathon
  const unassignedJudges =
    allJudges?.filter(
      (j) => !j.assignments.some((a) => a.hackathon?.id === hackathonId),
    ) || [];

  // Judge stats from rankings
  const judgeStatsMap = new Map<
    string,
    { projectsJudged: number; avgScore: number }
  >();
  if (rankings?.rankings) {
    rankings.rankings.forEach((r) => {
      r.votes.forEach((v) => {
        const existing = judgeStatsMap.get(v.judgeName) || {
          projectsJudged: 0,
          avgScore: 0,
        };
        existing.projectsJudged += 1;
        existing.avgScore =
          (existing.avgScore * (existing.projectsJudged - 1) + v.score) /
          existing.projectsJudged;
        judgeStatsMap.set(v.judgeName, existing);
      });
    });
  }

  if (judgesLoading) {
    return (
      <div className="text-[var(--text-subtle)] font-mono text-center py-20 animate-pulse">
        Loading Judges...
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
      {/* Judging Control Panel */}
      <LiquidGlass className="p-6 border-[var(--border-subtle)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2 mb-2">
              <Gavel className="w-4 h-4 text-purple-400" />
              Judging Controls
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[var(--text-subtle)] uppercase tracking-wider">
                Status:
              </span>
              <span
                className={`px-2 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider ${judgingStatus?.active ? "text-green-400 bg-green-500/10 border border-green-500/20" : "text-red-400 bg-red-500/10 border border-red-500/20"}`}
              >
                {judgingStatus?.active ? "LIVE" : "INACTIVE"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              toggleJudging.mutate({
                hackathonId,
                active: !judgingStatus?.active,
              })
            }
            disabled={toggleJudging.isPending}
            className={`px-6 py-3 text-sm font-bold uppercase tracking-wider rounded-none transition-ui disabled:opacity-50 ${
              judgingStatus?.active
                ? "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                : "bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20"
            }`}
          >
            {judgingStatus?.active ? "Stop Judging" : "Start Judging"}
          </button>
        </div>
      </LiquidGlass>

      {judgeError && (
        <div
          role="alert"
          className="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-mono text-red-300"
        >
          {judgeError}
        </div>
      )}

      {queueNotice && (
        <div
          role="status"
          className="border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-mono text-accent"
        >
          {queueNotice}
        </div>
      )}

      {/* Results — computed once judging closes, reviewed, then published. */}
      <LiquidGlass className="p-6 border-[var(--border-subtle)]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2 mb-2">
              <Gavel className="w-4 h-4 text-amber-400" />
              Results
            </h3>
            <p className="text-xs font-mono text-[var(--text-subtle)]">
              {!hasDraft
                ? "Not computed yet. Scores move with every vote until you freeze them."
                : isPublished
                  ? `Published — ${resultsDraft?.length} placing(s) visible to everyone.`
                  : `Draft ready — ${resultsDraft?.length} placing(s), not yet visible.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setResultsError(null);
                computeResults.mutate({
                  hackathonId,
                  // Only forced once COMPUTE's own refusal has been shown.
                  force: computeConflict,
                });
              }}
              disabled={computeResults.isPending || isPublished}
              className="px-5 py-3 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest rounded-none hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {computeResults.isPending
                ? "Computing…"
                : computeConflict
                  ? "Compute anyway"
                  : hasDraft
                    ? "Recompute"
                    : "Compute"}
            </button>
            {/* Publishing shows the results on the public tab; telling people
                was a separate step nobody was prompted about. */}
            {isPublished && (
              <button
                type="button"
                onClick={announceResults}
                disabled={announcing}
                className="px-5 py-3 bg-accent/10 border border-accent/30 text-accent text-xs font-bold uppercase tracking-widest rounded-none hover:bg-accent/20 transition-colors disabled:opacity-30"
              >
                {announcing ? "Announcing…" : "Announce Results"}
              </button>
            )}
            {hasDraft &&
              (isPublished ? (
                <button
                  type="button"
                  onClick={() => unpublishResults.mutate({ hackathonId })}
                  disabled={unpublishResults.isPending}
                  className="px-5 py-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest rounded-none hover:bg-red-500/20 transition-colors disabled:opacity-30"
                >
                  {unpublishResults.isPending ? "…" : "Unpublish"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Publish ${resultsDraft?.length} placing(s)? Everyone will see them immediately.`,
                      )
                    )
                      return;
                    publishResults.mutate({ hackathonId });
                  }}
                  disabled={publishResults.isPending}
                  className="px-5 py-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-widest rounded-none hover:bg-amber-500/20 transition-colors disabled:opacity-30"
                >
                  {publishResults.isPending ? "…" : "Publish"}
                </button>
              ))}
          </div>
        </div>

        {resultsError && (
          <p
            role="alert"
            className="mt-4 text-xs font-mono text-amber-300 leading-relaxed"
          >
            {resultsError}
          </p>
        )}

        {hasDraft && (
          <ol className="mt-5 space-y-1 max-h-64 overflow-y-auto">
            {resultsDraft?.slice(0, 20).map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 text-xs font-mono border-b border-[var(--border-subtle)] py-2"
              >
                <span className="text-[var(--text-primary)] truncate">
                  <span className="text-accent font-bold mr-3">
                    #{row.placement}
                  </span>
                  {row.project?.name ?? "Unknown"}
                </span>
                <span className="text-[var(--text-subtle)] shrink-0">
                  {row.weightedScore ?? "—"} · {row.voteCount} vote(s)
                </span>
              </li>
            ))}
          </ol>
        )}
      </LiquidGlass>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-none bg-purple-500/5 border border-purple-500/15 text-left">
          <p className="text-2xl font-black font-mono text-purple-400">
            {assignedJudges.length}
          </p>
          <p className="text-[10px] font-mono text-[var(--text-subtle)] uppercase tracking-widest mt-1">
            Assigned Judges
          </p>
        </div>
        <div className="p-4 rounded-none bg-white/5 border border-[var(--border-subtle)] text-left">
          <p className="text-2xl font-black font-mono text-[var(--text-primary)]">
            {allJudges?.length || 0}
          </p>
          <p className="text-[10px] font-mono text-[var(--text-subtle)] uppercase tracking-widest mt-1">
            Total Judges
          </p>
        </div>
        <div className="p-4 rounded-none bg-emerald-500/5 border border-emerald-500/15 text-left">
          <p className="text-2xl font-black font-mono text-accent">
            {rankings?.rankings?.length || 0}
          </p>
          <p className="text-[10px] font-mono text-[var(--text-subtle)] uppercase tracking-widest mt-1">
            Projects
          </p>
        </div>
        <div className="p-4 rounded-none bg-amber-500/5 border border-amber-500/15 text-left">
          <p className="text-2xl font-black font-mono text-amber-400">
            {rankings?.rankings?.reduce((sum, r) => sum + r.votes.length, 0) ||
              0}
          </p>
          <p className="text-[10px] font-mono text-[var(--text-subtle)] uppercase tracking-widest mt-1">
            Total Votes
          </p>
        </div>
      </div>

      {/* Assigned Judges */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-bold text-[var(--text-primary)] uppercase tracking-wider">
            Assigned Judges
          </h2>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-none text-xs font-bold uppercase tracking-wider hover:bg-purple-500/20 transition-colors flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" /> Assign Judge
          </button>
        </div>

        {/* Quick Assign Form */}
        {showAddForm && unassignedJudges.length > 0 && (
          <LiquidGlass className="p-6 mb-4 border-[var(--border-subtle)]">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <label
                  htmlFor="select-judge"
                  className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                >
                  Select Judge
                </label>
                <select
                  id="select-judge"
                  value={selectedJudgeId}
                  onChange={(e) => setSelectedJudgeId(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-purple-500/50 focus:outline-none transition-colors"
                >
                  <option value="">Choose a judge…</option>
                  {unassignedJudges.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.user?.name || j.name || j.user?.email || "Unknown"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-40">
                <label
                  htmlFor="track"
                  className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
                >
                  Track
                </label>
                <select
                  id="track"
                  value={assignTrack}
                  onChange={(e) => setAssignTrack(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-purple-500/50 focus:outline-none transition-colors"
                >
                  <option value="">All projects</option>
                  {trackOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!selectedJudgeId) return;
                  assignJudge.mutate({
                    judgeId: selectedJudgeId,
                    hackathonId,
                    track: assignTrack || undefined,
                  });
                  setSelectedJudgeId("");
                  setAssignTrack("");
                  setShowAddForm(false);
                }}
                disabled={!selectedJudgeId || assignJudge.isPending}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-[var(--text-primary)] font-semibold text-sm rounded-none active:scale-[0.98] transition-transform shadow-lg shadow-purple-500/20 disabled:opacity-50 whitespace-nowrap"
              >
                Assign
              </button>
            </div>
          </LiquidGlass>
        )}

        {/* Judges Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignedJudges.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 p-8 bg-white/[0.01] border border-dashed border-[var(--border-subtle)] rounded-none text-center">
              <p className="text-[var(--text-subtle)] font-mono text-xs uppercase tracking-widest">
                No judges assigned yet. Click "Assign Judge" to add one.
              </p>
            </div>
          ) : (
            assignedJudges.map((judge) => {
              const assignment = judge.assignments.find(
                (a) => a.hackathon?.id === hackathonId,
              );
              const stats = judgeStatsMap.get(
                judge.user?.name || judge.name || "",
              );

              return (
                <LiquidGlass
                  key={judge.id}
                  className="p-5 border-[var(--border-subtle)] hover:border-purple-500/20 transition-ui"
                >
                  <div className="flex items-start gap-3">
                    <Image
                      src={judge.user?.image || "/avatars/default.svg"}
                      alt="Judge"
                      width={40}
                      height={40}
                      className="rounded-sm bg-[var(--bg-primary)] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--text-primary)] font-bold text-sm truncate">
                        {judge.user?.name || judge.name}
                      </p>
                      <p className="text-[var(--text-subtle)] text-xs font-mono truncate">
                        {judge.user?.email}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {/* A wrong track routes the judge to an empty pool and
                            used to be permanent — assignToHackathon refuses a
                            second assignment and nothing else could edit it. */}
                        <select
                          aria-label="Track"
                          value={assignment?.track ?? ""}
                          disabled={updateTrack.isPending}
                          onChange={(e) => {
                            setQueueNotice(null);
                            setTrackConflict(null);
                            updateTrack.mutate({
                              judgeId: judge.id,
                              hackathonId,
                              track: e.target.value || null,
                            });
                          }}
                          className="px-2 py-0.5 text-[9px] font-mono rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest focus:outline-none disabled:opacity-40"
                        >
                          <option value="">All projects</option>
                          {trackOptions.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                          {/* A track the edition no longer lists still has to
                              be shown, or the select would silently misreport
                              what the judge is actually assigned to. */}
                          {assignment?.track &&
                            !trackOptions.includes(assignment.track) && (
                              <option value={assignment.track}>
                                {assignment.track} (not on this edition)
                              </option>
                            )}
                        </select>
                        {assignment?.isLead && (
                          <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-widest">
                            Lead
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 text-[9px] font-mono rounded uppercase tracking-widest ${judge.isActive ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}
                        >
                          {judge.isActive ? "Active" : "Inactive"}
                        </span>
                        <button
                          type="button"
                          disabled={setActive.isPending}
                          onClick={() =>
                            setActive.mutate({
                              judgeId: judge.id,
                              isActive: !judge.isActive,
                            })
                          }
                          className="px-2 py-0.5 text-[9px] font-mono rounded uppercase tracking-widest border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-white/10 transition-colors disabled:opacity-40"
                        >
                          {judge.isActive ? "Suspend" : "Approve"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {trackConflict?.judgeId === judge.id && (
                    <div
                      role="alert"
                      className="mt-3 p-3 border border-amber-500/30 bg-amber-500/10"
                    >
                      <p className="text-[11px] font-mono text-amber-300 leading-relaxed">
                        {trackConflict.message}
                      </p>
                      <button
                        type="button"
                        disabled={updateTrack.isPending}
                        onClick={() =>
                          updateTrack.mutate({
                            judgeId: trackConflict.judgeId,
                            hackathonId,
                            track: trackConflict.track,
                            force: true,
                          })
                        }
                        className="mt-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
                      >
                        Change track anyway
                      </button>
                    </div>
                  )}

                  {/* Stats */}
                  {stats && (
                    <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[var(--border-subtle)]">
                      <div>
                        <p className="text-[8px] font-mono text-[var(--text-subtle)] uppercase tracking-widest">
                          Judged
                        </p>
                        <p className="text-sm font-bold text-[var(--text-primary)] font-mono">
                          {stats.projectsJudged} projects
                        </p>
                      </div>
                      <div>
                        <p className="text-[8px] font-mono text-[var(--text-subtle)] uppercase tracking-widest">
                          Avg Score
                        </p>
                        <p className="text-sm font-bold text-accent font-mono">
                          {Math.round(stats.avgScore)}/50
                        </p>
                      </div>
                    </div>
                  )}
                </LiquidGlass>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
