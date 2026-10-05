"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { UserPlus, Copy } from "lucide-react";
import {
  body,
  btnDanger,
  btnInk,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  object,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";

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
        `Email everyone who checked in to ${name} that the results are live?\n\nThis cannot be unsent.`,
      )
    )
      return;

    setAnnouncing(true);
    setQueueNotice(null);
    try {
      const created = await createAnnouncement.mutateAsync({
        hackathonId,
        // The people who were there. "registered" also reached applicants
        // who were never accepted.
        audience: "checked_in",
        subject: `${name} results are live`,
        heading: "Results are live",
        body: `Judging for ${name} is finished and the results are published.\n\nThank you for building with us.`,
        ctaLabel: "See the results",
        // Slug when the name is known, id when it is not — this link goes out
        // in mail, so it has to resolve even if the name never loaded.
        ctaUrl: `${window.location.origin}/hackathons/${
          hackathon?.name ? hackathonSlug(hackathon.name) : hackathonId
        }?tab=RESULTS`,
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
  const [newJudgeEmail, setNewJudgeEmail] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  // Adds a judge by email and assigns them in one go. The picker alone never
  // showed: judge.register assigns on apply, so this edition had no
  // unassigned judges to pick, and there was no way to add a walk-in.
  const createJudge = trpc.judge.create.useMutation({
    onSuccess: (judge) => {
      // The judge exists now even if the assign below fails, so the picker
      // has to know about them, or re-adding by email says "already a judge".
      void utils.judge.list.invalidate();
      if (!judge) return;
      assignJudge.mutate({
        judgeId: judge.id,
        hackathonId,
        track: assignTrack || undefined,
      });
      setNewJudgeEmail("");
      setAssignTrack("");
      setShowAddForm(false);
    },
    onError: (error) => setJudgeError(error.message),
  });

  const applyLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/judge/register?hackathonId=${hackathonId}`;

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
    return <p className={`py-16 ${body}`}>Loading judges…</p>;
  }

  const totalVotes =
    rankings?.rankings?.reduce((sum, r) => sum + r.votes.length, 0) || 0;

  return (
    <div className="space-y-12">
      {/* Judging Control Panel */}
      <section className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className={sectionTitle}>Judging</h2>
          <p className="mt-2">
            <span className={status(judgingStatus?.active ? "accent" : "neutral")}>
              {judgingStatus?.active ? "Live" : "Not running"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Judging opens onto whatever is queued; promoting submissions
            and assigning judges happen on the Judging page. */}
          {!judgingStatus?.active && (
            <Link
              href={`/admin/judging?hackathonId=${hackathonId}`}
              className={btnSecondary}
            >
              Prepare judging
            </Link>
          )}
          <button
            type="button"
            onClick={() =>
              toggleJudging.mutate({
                hackathonId,
                active: !judgingStatus?.active,
              })
            }
            disabled={toggleJudging.isPending}
            className={judgingStatus?.active ? btnDanger : btnPrimary}
          >
            {judgingStatus?.active ? "Stop judging" : "Start judging"}
          </button>
        </div>
      </section>

      {(judgeError || queueNotice) && (
        <div className="-mt-6 space-y-3">
          {judgeError && (
            <p
              role="alert"
              className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
            >
              {judgeError}
            </p>
          )}

          {queueNotice && (
            <p
              role="status"
              className="border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]"
            >
              {queueNotice}
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      <dl className="flex flex-wrap gap-y-4">
        {[
          { label: "Assigned judges", value: assignedJudges.length },
          { label: "Judges in total", value: allJudges?.length || 0 },
          { label: "Projects", value: rankings?.rankings?.length || 0 },
          { label: "Votes", value: totalVotes },
        ].map((stat) => (
          <div
            key={stat.label}
            className="pr-6 mr-6 border-r border-[var(--border-subtle)] last:border-r-0 last:mr-0 last:pr-0"
          >
            <dt className={label}>{stat.label}</dt>
            <dd className="mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Results — computed once judging closes, reviewed, then published. */}
      <section className={sectionRule}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h3 className={itemTitle}>Results</h3>
            <p className={`mt-1 ${meta}`}>
              {!hasDraft
                ? "Not computed yet. Scores move with every vote until you freeze them."
                : isPublished
                  ? `Published. ${resultsDraft?.length} placing(s) visible to everyone.`
                  : `Draft ready. ${resultsDraft?.length} placing(s), not visible yet.`}
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
              className={btnSecondary}
            >
              {computeResults.isPending
                ? "Computing…"
                : computeConflict
                  ? "Compute anyway"
                  : hasDraft
                    ? "Recompute"
                    : "Compute results"}
            </button>
            {/* Publishing shows the results on the public tab; telling people
                was a separate step nobody was prompted about. */}
            {isPublished && (
              <button
                type="button"
                onClick={announceResults}
                disabled={announcing}
                className={btnSecondary}
              >
                {announcing ? "Announcing…" : "Email results"}
              </button>
            )}
            {hasDraft &&
              (isPublished ? (
                <button
                  type="button"
                  onClick={() => unpublishResults.mutate({ hackathonId })}
                  disabled={unpublishResults.isPending}
                  className={btnDanger}
                >
                  {unpublishResults.isPending ? "Unpublishing…" : "Unpublish"}
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
                  className={btnInk}
                >
                  {publishResults.isPending ? "Publishing…" : "Publish results"}
                </button>
              ))}
          </div>
        </div>

        {resultsError && (
          <p
            role="alert"
            className="mt-4 border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--warning)]"
          >
            {resultsError}
          </p>
        )}

        {hasDraft && (
          <ol className="mt-5 max-h-64 overflow-y-auto border-t border-[var(--border-subtle)]">
            {resultsDraft?.slice(0, 20).map((row) => (
              <li
                key={row.id}
                className="flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <span className="text-[var(--text-primary)] truncate">
                  <span className="inline-block w-10 font-semibold tabular-nums text-[var(--text-subtle)]">
                    {row.placement}
                  </span>
                  {row.project?.name ?? "Unknown"}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--text-subtle)]">
                  {row.weightedScore ?? "—"} · {row.voteCount} vote(s)
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Assigned Judges */}
      <section className={sectionRule}>
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-5">
          <h2 className={itemTitle}>Assigned judges</h2>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            aria-expanded={showAddForm}
            className={btnSecondary}
          >
            <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" /> Add judge
          </button>
        </div>

        {showAddForm && (
          <div className="mb-8 space-y-4 border-y border-[var(--border-subtle)] py-6">
            <form
              className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (selectedJudgeId) {
                  assignJudge.mutate({
                    judgeId: selectedJudgeId,
                    hackathonId,
                    track: assignTrack || undefined,
                  });
                  setSelectedJudgeId("");
                  setAssignTrack("");
                  setShowAddForm(false);
                  return;
                }
                if (!newJudgeEmail.trim()) return;
                setJudgeError(null);
                createJudge.mutate({
                  email: newJudgeEmail.trim(),
                  hackathonId,
                });
              }}
            >
              {unassignedJudges.length > 0 ? (
                <div className="sm:col-span-3">
                  <label htmlFor="select-judge" className={fieldLabel}>
                    Judge
                  </label>
                  <select
                    id="select-judge"
                    value={selectedJudgeId}
                    onChange={(e) => setSelectedJudgeId(e.target.value)}
                    className={input}
                  >
                    <option value="">Someone new, by email</option>
                    {unassignedJudges.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.user?.name ||
                          j.name ||
                          j.user?.email ||
                          "Unnamed judge"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {selectedJudgeId ? (
                <div />
              ) : (
                <div>
                  <label htmlFor="new-judge-email" className={fieldLabel}>
                    Email
                  </label>
                  <input
                    id="new-judge-email"
                    type="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={newJudgeEmail}
                    onChange={(e) => setNewJudgeEmail(e.target.value)}
                    placeholder="judge@company.com"
                    className={input}
                  />
                </div>
              )}
              <div>
                <label htmlFor="track" className={fieldLabel}>
                  Track
                </label>
                <select
                  id="track"
                  value={assignTrack}
                  onChange={(e) => setAssignTrack(e.target.value)}
                  className={input}
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
                type="submit"
                disabled={
                  (!selectedJudgeId && !newJudgeEmail.trim()) ||
                  createJudge.isPending ||
                  assignJudge.isPending
                }
                className={`${btnInk} whitespace-nowrap`}
              >
                {createJudge.isPending || assignJudge.isPending
                  ? "Adding…"
                  : "Add judge"}
              </button>
            </form>
            <p className={meta}>
              The person needs a portal account; signing in once creates one.
              Judges added here are active straight away.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-[var(--border-subtle)]">
              <p className={`flex-1 ${meta}`}>
                Or send judges the application link. You approve each one below.
              </p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(applyLink).then(() => {
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  });
                }}
                className={btnSecondary}
              >
                <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
                {linkCopied ? "Copied" : "Copy apply link"}
              </button>
            </div>
          </div>
        )}

        {/* Judges Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignedJudges.length === 0 ? (
            <p className={`md:col-span-2 lg:col-span-3 ${body}`}>
              No judges yet. Add one above, or send the application link.
            </p>
          ) : (
            assignedJudges.map((judge) => {
              const assignment = judge.assignments.find(
                (a) => a.hackathon?.id === hackathonId,
              );
              const stats = judgeStatsMap.get(
                judge.user?.name || judge.name || "",
              );

              return (
                <article key={judge.id} className={`${object} p-5`}>
                  <div className="flex items-start gap-3">
                    <Image
                      src={judge.user?.image || "/avatars/default.svg"}
                      alt="Judge"
                      width={40}
                      height={40}
                      className="rounded-full bg-[var(--bg-secondary)] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                        {judge.user?.name || judge.name}
                      </p>
                      <p className={`truncate ${meta}`}>{judge.user?.email}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={status(judge.isActive ? "success" : "warning")}>
                          {judge.isActive ? "Active" : "Inactive"}
                        </span>
                        {assignment?.isLead && (
                          <span className={meta}>Lead judge</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[10rem]">
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
                        className={`${input} py-2 text-sm`}
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
                    </div>
                    <button
                      type="button"
                      disabled={setActive.isPending}
                      onClick={() =>
                        setActive.mutate({
                          judgeId: judge.id,
                          isActive: !judge.isActive,
                        })
                      }
                      className={judge.isActive ? btnDanger : btnSecondary}
                    >
                      {judge.isActive ? "Suspend" : "Approve"}
                    </button>
                  </div>

                  {trackConflict?.judgeId === judge.id && (
                    <div
                      role="alert"
                      className="mt-4 border-l-2 border-[var(--warning)] pl-3"
                    >
                      <p className="text-[13px] leading-relaxed text-[var(--warning)]">
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
                        className={`mt-2 ${textLink}`}
                      >
                        Change track anyway
                      </button>
                    </div>
                  )}

                  {/* Stats */}
                  {stats && (
                    <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3">
                      <div>
                        <dt className={meta}>Judged</dt>
                        <dd className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
                          {stats.projectsJudged} projects
                        </dd>
                      </div>
                      <div>
                        <dt className={meta}>Average score</dt>
                        <dd className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
                          {Math.round(stats.avgScore)}/50
                        </dd>
                      </div>
                    </dl>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
